from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import NotFoundError, ValidationError
from models import Fragment, Script, User
from utils.serialization import format_iso_datetime, parse_json_list
from utils.time import get_app_timezone, get_local_day_bounds

from domains.fragments import repository as fragment_repository
from domains.scripts import repository as script_repository
from modules.shared.ports import TextGenerationProvider, VectorStore
from modules.shared.infrastructure import PromptLoader
from .daily_push import DailyPushFragmentSelector, build_fragments_text
from .pipeline import ScriptGenerationPipelineService
from .schemas import ScriptDetail, ScriptGenerationResponse, ScriptItem, ScriptListResponse

VALID_SCRIPT_STATUSES = {"draft", "ready", "filmed"}


def map_script(script: Script) -> ScriptDetail:
    """将脚本模型映射为对外响应结构。"""
    source_fragment_ids = parse_json_list(script.source_fragment_ids, allow_csv_fallback=False)
    return ScriptDetail(
        id=script.id,
        title=script.title,
        content=script.content,
        body_markdown=script.body_markdown or script.content,
        mode=script.mode,
        source_fragment_ids=source_fragment_ids,
        source_fragment_count=len(source_fragment_ids),
        status=script.status,
        is_daily_push=script.is_daily_push,
        created_at=format_iso_datetime(script.created_at),
    )


class ScriptGenerationUseCase:
    """封装脚本生成任务创建入口。"""

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
    """提供稿件查询能力。"""

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
    """提供稿件写操作能力。"""

    def update_script(
        self,
        *,
        db: Session,
        user_id: str,
        script_id: str,
        status_value: Optional[str],
        title: Optional[str],
        body_markdown: Optional[str],
    ) -> Script:
        """更新稿件标题或状态。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        if status_value is not None and status_value not in VALID_SCRIPT_STATUSES:
            raise ValidationError(message=f"无效的状态值: {status_value}", field_errors={"status": "必须是 draft、ready、filmed 之一"})
        normalized_body = body_markdown.strip() if body_markdown is not None else None
        return script_repository.update(db=db, script=script, status_value=status_value, title=title, body_markdown=normalized_body)

    def delete_script(self, *, db: Session, user_id: str, script_id: str) -> None:
        """删除指定稿件。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        script_repository.delete(db=db, script=script)


class DailyPushUseCase:
    """编排每日推盘任务。"""

    def __init__(
        self,
        *,
        llm_provider: TextGenerationProvider,
        prompt_loader: PromptLoader,
        vector_store: VectorStore,
        fragment_selector: DailyPushFragmentSelector | None = None,
    ) -> None:
        """装配每日推盘依赖。"""
        self.llm_provider = llm_provider
        self.prompt_loader = prompt_loader
        self.fragment_selector = fragment_selector or DailyPushFragmentSelector(vector_store=vector_store)

    async def trigger_for_user(
        self,
        *,
        db: Session,
        user_id: str,
        reference_time: datetime | None = None,
        force: bool = False,
    ) -> Script:
        """按当天碎片即时生成每日推盘。"""
        target_time = reference_time or datetime.now(timezone.utc)
        today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
        existing = script_repository.get_latest_daily_push_for_window(db=db, user_id=user_id, start_at=today_start, end_at=today_end)
        if existing:
            return existing

        recent_fragments = fragment_repository.list_content_ready_in_range(db=db, user_id=user_id, start_at=today_start, end_at=today_end)
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(
                message=f"今天至少需要 {settings.DAILY_PUSH_MIN_FRAGMENTS} 条已转写碎片，才能立即生成灵感卡片",
                field_errors={"fragments": "今日碎片数量不足"},
            )

        selected = recent_fragments if force else await self.fragment_selector.select_related_fragments(user_id=user_id, fragments=recent_fragments)
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
            body_markdown=content,
            mode="mode_a",
            source_fragment_ids=json.dumps([fragment.id for fragment in selected], ensure_ascii=False),
            title=f"{'强制' if force else '即时'}灵感推盘 · {local_now.date().isoformat()}",
            status="ready",
            is_daily_push=True,
        )

    async def run_daily_job(self, *, db: Session, reference_time: datetime | None = None) -> dict[str, Any]:
        """为所有用户执行每日推盘调度任务。"""
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
            recent_fragments = fragment_repository.list_content_ready_in_range(db=db, user_id=user_id, start_at=yesterday_start, end_at=yesterday_end)
            if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
                skipped_users += 1
                continue
            selected = await self.fragment_selector.select_related_fragments(user_id=user_id, fragments=recent_fragments)
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
                body_markdown=content,
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
