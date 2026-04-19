from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import ValidationError
from core.logging_config import get_logger
from domains.tasks import repository as task_repository
from domains.scripts import repository as script_repository
from models import TaskRun
from modules.shared.tasks.task_types import TaskExecutionContext, TaskExecutionError, TaskStepDefinition
from modules.shared.ports import VectorStore
from modules.shared.content.content_html import convert_markdown_to_basic_html
from modules.shared.fragment_snapshots import hydrate_fragment_snapshot
from modules.shared.prompt_loader import load_prompt_text, render_prompt_template
from utils.time import ensure_aware_utc, get_app_timezone, get_local_day_bounds

from .daily_push import DailyPushFragmentSelector, read_fragment_content
from .daily_push_snapshots import DailyPushFragmentSnapshot, DailyPushSnapshotReader

logger = get_logger(__name__)

TASK_TYPE_DAILY_PUSH_GENERATION = "daily_push_generation"

# 每日推盘生成系统提示路径
_DAILY_PUSH_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "daily_push.txt"
_DAILY_PUSH_USER_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "daily_push_user.txt"


def _load_daily_push_prompt() -> str:
    """读取每日推盘生成系统提示文本。"""
    return load_prompt_text(_DAILY_PUSH_PROMPT_PATH)


def _fragment_content(fragment: DailyPushFragmentSnapshot) -> str:
    """统一读取每日推盘的碎片正文。"""
    return read_fragment_content(fragment)


def _build_fragment_summary(fragment: DailyPushFragmentSnapshot) -> str:
    """构造碎片摘要文本，优先使用 summary，补充 tags。"""
    parts = []
    content = _fragment_content(fragment)
    if content:
        parts.append(content)
    if fragment.summary:
        parts.append(f"（摘要：{fragment.summary}）")
    return "\n".join(parts)


def _hydrate_fragment_snapshot(item: dict[str, Any], *, user_id: str) -> DailyPushFragmentSnapshot | None:
    """把任务输入中的字典恢复为快照 DTO。"""
    return hydrate_fragment_snapshot(item, user_id=user_id)


class DailyPushPersistenceService:
    """封装每日推盘结果落库。"""

    def persist_script(
        self,
        *,
        db: Session,
        run: TaskRun,
        input_payload: dict[str, Any],
        draft: str,
        title: str | None = None,
    ) -> dict[str, Any]:
        """将 LLM 草稿写入脚本记录，已存在则复用。"""
        draft = draft.strip()
        if not draft:
            raise ValidationError(message="每日推盘 LLM 输出缺少 draft，无法创建稿件", field_errors={"generation": "LLM 返回为空"})
        existing = script_repository.get_by_id(db=db, user_id=run.user_id, script_id=run.resource_id or "")
        if existing is None:
            existing = self._get_existing_script_for_target_date(
                db=db,
                user_id=run.user_id,
                target_date=input_payload["target_date"],
            )
        if existing:
            return {"script_id": existing.id}

        local_date = input_payload["target_date"]
        resolved_title = title or f"{input_payload['title_prefix']}灵感推盘 · {local_date}"
        try:
            script = script_repository.create(
                db=db,
                user_id=run.user_id,
                body_html=convert_markdown_to_basic_html(draft),
                mode="mode_daily_push",
                source_fragment_ids=json.dumps(input_payload["fragment_ids"], ensure_ascii=False),
                title=resolved_title,
                status="ready",
                is_daily_push=True,
                auto_commit=False,
            )
            task_repository.update_run_resource(
                db=db,
                run_id=run.id,
                resource_type="script",
                resource_id=script.id,
                output_payload={"script_id": script.id, "target_date": local_date, "is_daily_push": True},
                auto_commit=False,
            )
            db.commit()
            db.refresh(script)
            return {"script_id": script.id}
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def _get_existing_script_for_target_date(*, db: Session, user_id: str, target_date: str):
        """按目标日期兜底读取已存在的每日推盘稿件。"""
        parsed_date = date.fromisoformat(target_date)
        day_start = datetime.combine(parsed_date, time.min, tzinfo=get_app_timezone())
        day_end = datetime.combine(parsed_date, time.max, tzinfo=get_app_timezone())
        return script_repository.get_latest_daily_push_for_window(
            db=db,
            user_id=user_id,
            start_at=day_start,
            end_at=day_end,
        )


class DailyPushTaskService:
    """负责每日推盘异步任务的定义、创建与推进。"""

    def __init__(
        self,
        *,
        vector_store: VectorStore,
        persistence_service: DailyPushPersistenceService,
        task_runner,
        snapshot_reader: DailyPushSnapshotReader,
        fragment_selector: DailyPushFragmentSelector | None = None,
    ) -> None:
        """装配每日推盘任务依赖。"""
        self.fragment_selector = fragment_selector or DailyPushFragmentSelector(vector_store=vector_store)
        self.persistence_service = persistence_service
        self.task_runner = task_runner
        self.snapshot_reader = snapshot_reader

    async def create_run(
        self,
        *,
        db: Session,
        user_id: str,
        reference_time: datetime | None,
        force: bool,
        source_day_offset: int,
        title_prefix: str,
        trigger_kind: str,
    ) -> TaskRun:
        """为指定用户创建每日推盘任务，必要时复用当天已有结果。"""
        target_time = reference_time or datetime.now(timezone.utc)
        today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
        existing_script = script_repository.get_latest_daily_push_for_window(
            db=db,
            user_id=user_id,
            start_at=today_start,
            end_at=today_end,
        )
        if existing_script:
            existing_run = task_repository.get_latest_run_by_resource(
                db=db,
                user_id=user_id,
                task_type=TASK_TYPE_DAILY_PUSH_GENERATION,
                resource_type="script",
                resource_id=existing_script.id,
            )
            if existing_run:
                return existing_run
        existing_active_run = task_repository.get_latest_run_by_type_in_window(
            db=db,
            user_id=user_id,
            task_type=TASK_TYPE_DAILY_PUSH_GENERATION,
            start_at=today_start,
            end_at=today_end,
            statuses=["queued", "running", "succeeded"],
        )
        if existing_active_run:
            return existing_active_run

        source_start, source_end = get_local_day_bounds(target_time, day_offset=source_day_offset)
        recent_fragments = self.snapshot_reader.list_fragment_snapshots(
            db=db,
            user_id=user_id,
            start_at=source_start,
            end_at=source_end,
        )
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            if trigger_kind.startswith("manual"):
                manual_fallback = self.snapshot_reader.list_recent_fragment_snapshots(
                    db=db,
                    user_id=user_id,
                    limit=max(settings.DAILY_PUSH_MIN_FRAGMENTS * 4, 12),
                )
                recent_fragments = [fragment for fragment in manual_fallback if read_fragment_content(fragment)]
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(
                message=f"今天至少需要 {settings.DAILY_PUSH_MIN_FRAGMENTS} 条已备份碎片，才能生成灵感卡片",
                field_errors={"fragments": "碎片数量不足"},
            )
        selected = recent_fragments if force else await self.fragment_selector.select_related_fragments(user_id=user_id, fragments=recent_fragments)
        if len(selected) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            # 中文注释：当相似度图临时不可用或召回退化时，手动触发仍优先兜底使用当天碎片，避免功能完全不可用。
            if len(recent_fragments) >= settings.DAILY_PUSH_MIN_FRAGMENTS:
                logger.warning(
                    "daily_push_selector_fallback_to_recent_fragments",
                    user_id=user_id,
                    recent_fragment_count=len(recent_fragments),
                    selected_count=len(selected),
                )
                selected = recent_fragments
            else:
                raise ValidationError(message="今天的碎片主题还不够集中，暂时无法生成灵感卡片", field_errors={"fragments": "语义关联不足"})

        local_date = target_time.astimezone(get_app_timezone()).date().isoformat()
        return await self.task_runner.create_run(
            run_id=None,
            user_id=user_id,
            task_type=TASK_TYPE_DAILY_PUSH_GENERATION,
            input_payload={
                "fragment_ids": [fragment.id for fragment in selected],
                "fragment_snapshots": self.snapshot_reader.serialize_snapshots(selected),
                "target_date": local_date,
                "force": force,
                "trigger_kind": trigger_kind,
                "title_prefix": title_prefix,
                "source_day_offset": source_day_offset,
                "source_window_start": source_start.isoformat(),
                "source_window_end": source_end.isoformat(),
            },
            resource_type=None,
            resource_id=None,
            auto_wake=True,
        )

    async def enqueue_for_all_users(self, *, db: Session, reference_time: datetime | None = None) -> dict[str, Any]:
        """为所有用户入队每日推盘任务。"""
        target_time = reference_time or datetime.now(timezone.utc)
        created_run_ids: list[str] = []
        skipped_users = 0
        user_ids = self.snapshot_reader.list_user_ids(db=db)
        for user_id in sorted(set(user_ids)):
            try:
                run = await self.create_run(
                    db=db,
                    user_id=user_id,
                    reference_time=target_time,
                    force=False,
                    source_day_offset=-1,
                    title_prefix="每日",
                    trigger_kind="scheduled",
                )
            except ValidationError:
                skipped_users += 1
                continue
            created_run_ids.append(run.id)
        return {
            "processed_users": len(user_ids),
            "queued_runs": len(created_run_ids),
            "run_ids": created_run_ids,
            "skipped_users": skipped_users,
        }

    def build_task_definitions(self) -> list[TaskStepDefinition]:
        """返回每日推盘任务的固定步骤。"""
        return [
            TaskStepDefinition(step_name="collect_daily_push_context", executor=self.collect_daily_push_context, max_attempts=1),
            TaskStepDefinition(step_name="generate_daily_push_draft", executor=self.generate_daily_push_draft, max_attempts=2),
            TaskStepDefinition(step_name="persist_daily_push_script", executor=self.persist_daily_push_script, max_attempts=2),
            TaskStepDefinition(step_name="finalize_daily_push_run", executor=self.finalize_daily_push_run, max_attempts=1),
        ]

    async def collect_daily_push_context(self, context: TaskExecutionContext) -> dict[str, Any]:
        """根据已选碎片组装每日推盘上下文文本。"""
        payload = context.input_payload
        serialized_snapshots = payload.get("fragment_snapshots") or []
        snapshot_map: dict[str, DailyPushFragmentSnapshot] = {}
        for item in serialized_snapshots:
            if not isinstance(item, dict):
                continue
            snapshot = _hydrate_fragment_snapshot(item, user_id=context.run.user_id)
            if snapshot is not None:
                snapshot_map[snapshot.id] = snapshot
        ordered_fragments = [snapshot_map[fid] for fid in payload["fragment_ids"] if fid in snapshot_map]
        if len(ordered_fragments) != len(payload["fragment_ids"]):
            raise ValidationError(message="每日推盘引用的碎片不存在或无权访问", field_errors={"fragment_ids": "碎片缺失"})
        content_parts = []
        for fragment in ordered_fragments:
            summary_text = _build_fragment_summary(fragment)
            if summary_text:
                content_parts.append(summary_text)
        if not content_parts:
            raise ValidationError(message="选中的碎片均无可用文本，无法生成每日推盘", field_errors={"fragment_ids": "碎片内容为空"})
        return {"fragments_text": "\n\n---\n\n".join(content_parts)}

    async def generate_daily_push_draft(self, context: TaskExecutionContext) -> dict[str, Any]:
        """调用 LLM 基于碎片文本生成每日推盘草稿。"""
        fragments_text = context.get_step_output("collect_daily_push_context").get("fragments_text", "")
        try:
            system_prompt = _load_daily_push_prompt()
        except Exception as exc:
            raise TaskExecutionError(f"读取每日推盘提示词失败: {exc}", retryable=False) from exc
        draft = await context.container.llm_provider.generate(
            system_prompt=system_prompt,
            user_message=render_prompt_template(_DAILY_PUSH_USER_PROMPT_PATH, fragments_text=fragments_text),
            temperature=0.7,
        )
        if not draft or not draft.strip():
            raise TaskExecutionError("LLM 未返回每日推盘草稿", retryable=True)
        # 尝试从首行提取标题
        lines = draft.strip().splitlines()
        title = lines[0].strip() if lines else None
        body = "\n".join(lines[2:]).strip() if len(lines) > 2 else draft.strip()
        if not body:
            body = draft.strip()
            title = None
        return {"draft": body, "title": title}

    async def persist_daily_push_script(self, context: TaskExecutionContext) -> dict[str, Any]:
        """将 LLM 草稿写入脚本记录。"""
        draft_output = context.get_step_output("generate_daily_push_draft")
        return self.persistence_service.persist_script(
            db=context.db,
            run=context.run,
            input_payload=context.input_payload,
            draft=draft_output.get("draft", ""),
            title=draft_output.get("title"),
        )

    async def finalize_daily_push_run(self, context: TaskExecutionContext) -> dict[str, Any]:
        """结束每日推盘任务。"""
        persist_payload = context.get_step_output("persist_daily_push_script")
        script_id = persist_payload["script_id"]
        return {
            "resource_type": "script",
            "resource_id": script_id,
            "target_date": context.input_payload["target_date"],
            "is_daily_push": True,
        }


def build_daily_push_task_service(container) -> DailyPushTaskService:
    """基于容器组装每日推盘任务服务。"""
    return DailyPushTaskService(
        vector_store=container.vector_store,
        persistence_service=DailyPushPersistenceService(),
        task_runner=container.task_runner,
        snapshot_reader=DailyPushSnapshotReader(),
    )
