from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Script
from modules.shared.content.content_html import normalize_body_html
from utils.serialization import format_iso_datetime, parse_json_list
from utils.time import get_local_day_bounds

from domains.scripts import repository as script_repository
from .daily_push_task import DailyPushTaskService, TASK_TYPE_DAILY_PUSH_GENERATION
from .rag_task import RagScriptTaskService
from .schemas import ScriptDetail, ScriptGenerationResponse, ScriptItem, ScriptListResponse

VALID_SCRIPT_STATUSES = {"draft", "ready", "filmed"}


def map_script(script: Script) -> ScriptDetail:
    """将脚本模型映射为对外响应结构。"""
    # 中文注释：空 JSON 数组或缺失来源碎片时，接口应稳定返回 []，避免详情/列表对 None 取长度。
    source_fragment_ids = parse_json_list(script.source_fragment_ids, allow_csv_fallback=False) or []
    return ScriptDetail(
        id=script.id,
        title=script.title,
        body_html=script.body_html,
        mode=script.mode,
        source_fragment_ids=source_fragment_ids,
        source_fragment_count=len(source_fragment_ids),
        status=script.status,
        is_daily_push=script.is_daily_push,
        created_at=format_iso_datetime(script.created_at),
    )


class RagScriptGenerationUseCase:
    """封装 RAG 脚本生成任务创建入口。"""

    def __init__(self, *, task_service: RagScriptTaskService) -> None:
        """装配 RAG 脚本生成任务依赖。"""
        self.task_service = task_service

    async def generate_async(
        self,
        *,
        db: Session,
        user_id: str,
        topic: str,
        fragment_ids: list[str],
    ) -> ScriptGenerationResponse:
        """创建基于主题和参考脚本 RAG 的异步脚本生成任务。"""
        run = await self.task_service.create_run(
            db=db,
            user_id=user_id,
            topic=topic,
            fragment_ids=fragment_ids,
        )
        return ScriptGenerationResponse(
            task_id=run.id,
            task_type="rag_script_generation",
            status_query_url=f"/api/tasks/{run.id}",
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
        body_html: Optional[str],
    ) -> Script:
        """更新稿件标题或状态。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        if status_value is not None and status_value not in VALID_SCRIPT_STATUSES:
            raise ValidationError(message=f"无效的状态值: {status_value}", field_errors={"status": "必须是 draft、ready、filmed 之一"})
        normalized_body = normalize_body_html(body_html) if body_html is not None else None
        return script_repository.update(db=db, script=script, status_value=status_value, title=title, body_html=normalized_body)

    def delete_script(self, *, db: Session, user_id: str, script_id: str) -> None:
        """删除指定稿件。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        script_repository.delete(db=db, script=script)


class DailyPushUseCase:
    """编排每日推盘任务。"""

    def __init__(
        self,
        *,
        task_service: DailyPushTaskService,
    ) -> None:
        """装配每日推盘任务依赖。"""
        self.task_service = task_service

    async def trigger_for_user(
        self,
        *,
        db: Session,
        user_id: str,
        force: bool = False,
    ) -> ScriptGenerationResponse:
        """按当天碎片创建异步每日推盘任务。"""
        run = await self.task_service.create_run(
            db=db,
            user_id=user_id,
            reference_time=None,
            force=force,
            source_day_offset=0,
            title_prefix="强制" if force else "即时",
            trigger_kind="manual_force" if force else "manual",
        )
        return ScriptGenerationResponse(
            task_id=run.id,
            task_type=TASK_TYPE_DAILY_PUSH_GENERATION,
            status_query_url=f"/api/tasks/{run.id}",
            status=run.status,
        )

    async def run_daily_job(self, *, db: Session) -> dict:
        """为所有用户入队每日推盘调度任务。"""
        return await self.task_service.enqueue_for_all_users(db=db)
