from __future__ import annotations

import json
from datetime import datetime, timezone
from math import ceil
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import NotFoundError, ValidationError
from models import Fragment, Script, User
from utils.serialization import format_iso_datetime, parse_json_list
from utils.time import get_app_timezone, get_local_day_bounds

from domains.fragments import repository as fragment_repository
from domains.scripts import repository as script_repository
from modules.shared.container import PromptLoader
from modules.shared.ports import TextGenerationProvider, VectorStore
from .pipeline import ScriptGenerationPipelineService
from .schemas import ScriptDetail, ScriptGenerationResponse, ScriptItem, ScriptListResponse

VALID_SCRIPT_MODES = {"mode_a", "mode_b"}
VALID_SCRIPT_STATUSES = {"draft", "ready", "filmed"}


def map_script(script: Script) -> ScriptDetail:
    """将脚本模型映射为对外响应结构。"""
    source_fragment_ids = parse_json_list(script.source_fragment_ids, allow_csv_fallback=False)
    return ScriptDetail(
        id=script.id,
        title=script.title,
        content=script.content,
        mode=script.mode,
        source_fragment_ids=source_fragment_ids,
        source_fragment_count=len(source_fragment_ids),
        status=script.status,
        is_daily_push=script.is_daily_push,
        created_at=format_iso_datetime(script.created_at),
    )


def build_fragments_text(fragments: list[Fragment]) -> str:
    """拼接脚本生成所需的碎片文本。"""
    parts = [fragment.transcript for fragment in fragments if fragment.transcript]
    if not parts:
        raise ValidationError(message="选中的碎片均无转写内容，无法生成口播稿", field_errors={"fragment_ids": "碎片内容为空"})
    return "\n\n---\n\n".join(parts)


class ScriptGenerationUseCase:
    def __init__(
        self,
        *,
        pipeline_service: ScriptGenerationPipelineService,
    ) -> None:
        """装配脚本生成任务态依赖。"""
        self.pipeline_service = pipeline_service

    async def generate_async(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
    ) -> ScriptGenerationResponse:
        """创建异步脚本生成流水线。"""
        run = await self.pipeline_service.create_run(
            db=db,
            user_id=user_id,
            fragment_ids=fragment_ids,
            mode=mode,
            query_hint=query_hint,
            include_web_search=include_web_search,
        )
        return ScriptGenerationResponse(
            pipeline_run_id=run.id,
            pipeline_type="script_generation",
            status=run.status,
        )

class ScriptQueryService:
    def list_scripts(self, *, db: Session, user_id: str, limit: int, offset: int) -> ScriptListResponse:
        """分页返回当前用户的口播稿列表。"""
        items = script_repository.list_by_user(db=db, user_id=user_id, limit=limit, offset=offset)
        total = script_repository.count_by_user(db=db, user_id=user_id)
        return ScriptListResponse(
            items=[ScriptItem.model_validate(map_script(item).model_dump()) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_script(self, *, db: Session, user_id: str, script_id: str) -> Script:
        """读取单篇口播稿详情。"""
        script = script_repository.get_by_id(db=db, user_id=user_id, script_id=script_id)
        if not script:
            raise NotFoundError(message="口播稿不存在或无权访问", resource_type="script", resource_id=script_id)
        return script

    def get_today_daily_push(self, *, db: Session, user_id: str) -> Script:
        """读取当天的每日推盘稿件。"""
        start_at, end_at = get_local_day_bounds()
        script = script_repository.get_latest_daily_push_for_window(db=db, user_id=user_id, start_at=start_at, end_at=end_at)
        if not script:
            raise NotFoundError(message="今日暂无每日推盘稿件", resource_type="script", resource_id="daily-push")
        return script


class ScriptCommandService:
    def update_script(self, *, db: Session, user_id: str, script_id: str, status_value: Optional[str], title: Optional[str]) -> Script:
        """更新稿件标题或状态。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        if status_value is not None and status_value not in VALID_SCRIPT_STATUSES:
            raise ValidationError(message=f"无效的状态值: {status_value}", field_errors={"status": "必须是 draft、ready、filmed 之一"})
        return script_repository.update(db=db, script=script, status_value=status_value, title=title)

    def delete_script(self, *, db: Session, user_id: str, script_id: str) -> None:
        """删除指定稿件。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        script_repository.delete(db=db, script=script)


class DailyPushUseCase:
    def __init__(self, *, llm_provider: TextGenerationProvider, prompt_loader: PromptLoader, vector_store: VectorStore) -> None:
        """装配每日推盘依赖。"""
        self.llm_provider = llm_provider
        self.prompt_loader = prompt_loader
        self.vector_store = vector_store

    async def trigger_for_user(
        self,
        *,
        db: Session,
        user_id: str,
        reference_time: datetime | None = None,
        force: bool = False,
    ) -> Script:
        target_time = reference_time or datetime.now(timezone.utc)
        today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
        existing = script_repository.get_latest_daily_push_for_window(db=db, user_id=user_id, start_at=today_start, end_at=today_end)
        if existing:
            return existing

        recent_fragments = fragment_repository.list_synced_in_range(db=db, user_id=user_id, start_at=today_start, end_at=today_end)
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(
                message=f"今天至少需要 {settings.DAILY_PUSH_MIN_FRAGMENTS} 条已转写碎片，才能立即生成灵感卡片",
                field_errors={"fragments": "今日碎片数量不足"},
            )

        selected = recent_fragments if force else await self._select_related_fragments(user_id=user_id, fragments=recent_fragments)
        if len(selected) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(message="今天的碎片主题还不够集中，暂时无法生成灵感卡片", field_errors={"fragments": "语义关联不足"})

        content = await self.llm_provider.generate(
            system_prompt=self.prompt_loader.load_script_prompt("mode_a").replace("{fragments_text}", build_fragments_text(selected)),
            user_message="",
            temperature=0.7,
            max_tokens=1500,
        )
        local_now = target_time.astimezone(get_app_timezone())
        return script_repository.create(
            db=db,
            user_id=user_id,
            content=content,
            mode="mode_a",
            source_fragment_ids=json.dumps([fragment.id for fragment in selected], ensure_ascii=False),
            title=f"{'强制' if force else '即时'}灵感推盘 · {local_now.date().isoformat()}",
            status="ready",
            is_daily_push=True,
        )

    async def run_daily_job(self, *, db: Session, reference_time: datetime | None = None) -> dict[str, Any]:
        target_time = reference_time or datetime.now(timezone.utc)
        yesterday_start, yesterday_end = get_local_day_bounds(target_time, day_offset=-1)
        today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
        local_now = target_time.astimezone(get_app_timezone())
        generated_script_ids: list[str] = []
        skipped_users = 0
        user_ids = {row[0] for row in db.query(User.id).all()}
        user_ids.update(row[0] for row in db.query(Fragment.user_id).filter(Fragment.user_id.isnot(None)).distinct().all())

        for user_id in sorted(user_ids):
            if script_repository.get_latest_daily_push_for_window(db=db, user_id=user_id, start_at=today_start, end_at=today_end):
                skipped_users += 1
                continue
            recent_fragments = fragment_repository.list_synced_in_range(db=db, user_id=user_id, start_at=yesterday_start, end_at=yesterday_end)
            if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
                skipped_users += 1
                continue
            selected = await self._select_related_fragments(user_id=user_id, fragments=recent_fragments)
            if len(selected) < settings.DAILY_PUSH_MIN_FRAGMENTS:
                skipped_users += 1
                continue
            content = await self.llm_provider.generate(
                system_prompt=self.prompt_loader.load_script_prompt("mode_a").replace("{fragments_text}", build_fragments_text(selected)),
                user_message="",
                temperature=0.7,
                max_tokens=1500,
            )
            script = script_repository.create(
                db=db,
                user_id=user_id,
                content=content,
                mode="mode_a",
                source_fragment_ids=json.dumps([fragment.id for fragment in selected], ensure_ascii=False),
                title=f"每日灵感推盘 · {local_now.date().isoformat()}",
                status="ready",
                is_daily_push=True,
            )
            generated_script_ids.append(script.id)

        return {
            "processed_users": len(user_ids),
            "generated_scripts": len(generated_script_ids),
            "generated_script_ids": generated_script_ids,
            "skipped_users": skipped_users,
            "window_start": yesterday_start.isoformat(),
            "window_end": yesterday_end.isoformat(),
        }

    async def _select_related_fragments(self, *, user_id: str, fragments: list[Fragment]) -> list[Fragment]:
        candidate_ids = {fragment.id for fragment in fragments if fragment.transcript}
        if len(candidate_ids) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            return []
        adjacency: dict[str, set[str]] = {fragment.id: set() for fragment in fragments}
        top_k = max(5, ceil(len(fragments) * 1.5))
        for fragment in fragments:
            query_text = fragment.transcript or fragment.summary or ""
            if not query_text.strip():
                continue
            try:
                matches = await self.vector_store.query_fragments(
                    user_id=user_id,
                    query_text=query_text,
                    top_k=top_k,
                    exclude_ids=[fragment.id],
                )
            except Exception:
                continue
            for match in matches:
                matched_id = match.get("fragment_id")
                score = float(match.get("score") or 0.0)
                if matched_id in candidate_ids and score >= settings.DAILY_PUSH_SIMILARITY_THRESHOLD:
                    adjacency.setdefault(fragment.id, set()).add(matched_id)
                    adjacency.setdefault(matched_id, set()).add(fragment.id)
        largest_component = _largest_connected_component(adjacency=adjacency, fragment_ids=candidate_ids)
        fragment_map = {fragment.id: fragment for fragment in fragments}
        selected = [fragment_map[fragment_id] for fragment_id in largest_component if fragment_id in fragment_map]
        return sorted(selected, key=lambda fragment: fragment.created_at)


def _largest_connected_component(*, adjacency: dict[str, set[str]], fragment_ids: set[str]) -> list[str]:
    visited: set[str] = set()
    best_component: list[str] = []
    for fragment_id in fragment_ids:
        if fragment_id in visited:
            continue
        stack = [fragment_id]
        component: list[str] = []
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            component.append(current)
            stack.extend(neighbor for neighbor in adjacency.get(current, set()) if neighbor not in visited)
        if len(component) > len(best_component):
            best_component = component
    return best_component
