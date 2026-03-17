from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import ValidationError
from domains.fragments import repository as fragment_repository
from domains.pipelines import repository as pipeline_repository
from domains.scripts import repository as script_repository
from models import Fragment, PipelineRun, User
from modules.shared.pipeline.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition
from modules.shared.ports import VectorStore, WorkflowProvider
from modules.shared.content.content_html import convert_markdown_to_basic_html
from utils.serialization import format_iso_datetime, parse_json_list
from utils.time import get_app_timezone, get_local_day_bounds

from .daily_push import DailyPushFragmentSelector, read_fragment_content

SUCCESS_STATUSES = {"succeeded", "success", "completed"}
FAILED_STATUSES = {"failed", "error", "stopped"}
PIPELINE_TYPE_DAILY_PUSH_GENERATION = "daily_push_generation"


def _build_poll_max_attempts(timeout_seconds: int) -> int:
    """根据指数退避窗口推导 workflow 轮询步骤的最大尝试次数。"""
    attempts = 1
    total_wait = 0
    while total_wait < timeout_seconds:
        total_wait += max(1, (2 ** attempts) - 1)
        attempts += 1
    return max(4, attempts)


@dataclass
class DailyPushContext:
    """描述每日推盘提交给工作流的结构化上下文。"""

    mode: str
    selected_fragments: list[dict[str, Any]]
    fragments_text: str
    target_date: str
    trigger_kind: str
    force: bool
    generation_metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """将上下文稳定转换为可持久化字典。"""
        return asdict(self)


def _build_fragment_payload(fragment: Fragment) -> dict[str, Any]:
    """构造每日推盘工作流使用的碎片载荷。"""
    return {
        "id": fragment.id,
        "transcript": _fragment_content(fragment),
        "summary": fragment.summary,
        "tags": parse_json_list(fragment.tags),
        "source": fragment.source,
        "created_at": format_iso_datetime(fragment.created_at),
    }


def _fragment_content(fragment: Fragment) -> str:
    """统一读取每日推盘的碎片正文。"""
    return read_fragment_content(fragment)


def build_daily_push_workflow_inputs(context: DailyPushContext) -> dict[str, Any]:
    """构造每日推盘提交给 provider 的统一输入。"""
    return {
        "mode": context.mode,
        "selected_fragments": context.selected_fragments,
        "fragments_text": context.fragments_text,
        "target_date": context.target_date,
        "trigger_kind": context.trigger_kind,
        "force": context.force,
        "generation_metadata": context.generation_metadata,
    }


class DailyPushPersistenceService:
    """封装每日推盘结果解析与落库。"""

    @staticmethod
    def build_provider_metadata(*, workflow_id: str | None, provider_run_id: str | None, provider_task_id: str | None) -> dict[str, str]:
        """构造流水线结果中可复用的 provider 元数据。"""
        provider: dict[str, str] = {}
        if workflow_id:
            provider["workflow_id"] = workflow_id
        if provider_run_id:
            provider["provider_run_id"] = provider_run_id
        if provider_task_id:
            provider["provider_task_id"] = provider_task_id
        return provider

    def parse_outputs(self, outputs: dict[str, Any]) -> dict[str, Any]:
        """规范化每日推盘工作流输出字段。"""
        if not isinstance(outputs, dict):
            return {}
        return {
            "title": outputs.get("title"),
            "draft": outputs.get("draft") or outputs.get("content") or outputs.get("body_markdown"),
            "outline": outputs.get("outline"),
            "model_metadata": outputs.get("model_metadata"),
        }

    def resolve_failure_message(self, payload: dict[str, Any]) -> str:
        """提取 provider 失败时最可读的错误信息。"""
        return payload.get("error") or payload.get("message") or payload.get("status") or "每日推盘工作流执行失败"

    def persist_script(
        self,
        *,
        db: Session,
        run: PipelineRun,
        input_payload: dict[str, Any],
        parsed_result: dict[str, Any],
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """在工作流成功后回流创建每日推盘稿件。"""
        draft = (parsed_result.get("draft") or "").strip()
        if not draft:
            raise ValidationError(message="每日推盘工作流输出缺少 draft，无法创建稿件", field_errors={"generation": "工作流执行失败"})
        existing = script_repository.get_by_id(db=db, user_id=run.user_id, script_id=run.resource_id or "")
        if existing is None:
            existing = self._get_existing_script_for_target_date(
                db=db,
                user_id=run.user_id,
                target_date=input_payload["target_date"],
            )
        if existing:
            return self._build_run_output(
                script_id=existing.id,
                parsed_result=parsed_result,
                target_date=input_payload["target_date"],
                provider_metadata=provider_metadata,
            )

        local_date = input_payload["target_date"]
        title = parsed_result.get("title") or f"{input_payload['title_prefix']}灵感推盘 · {local_date}"
        script = script_repository.create(
            db=db,
            user_id=run.user_id,
            body_html=convert_markdown_to_basic_html(draft),
            mode="mode_a",
            source_fragment_ids=json.dumps(input_payload["fragment_ids"], ensure_ascii=False),
            title=title,
            status="ready",
            is_daily_push=True,
        )
        run_output = self._build_run_output(
            script_id=script.id,
            parsed_result=parsed_result,
            target_date=input_payload["target_date"],
            provider_metadata=provider_metadata,
        )
        pipeline_repository.update_run_resource(
            db=db,
            run_id=run.id,
            resource_type="script",
            resource_id=script.id,
            output_payload=run_output,
        )
        return run_output

    def build_finalize_payload(
        self,
        *,
        script_id: str,
        parsed_result: dict[str, Any],
        target_date: str,
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """构造结束流水线所需的最终返回。"""
        return {
            "resource_type": "script",
            "resource_id": script_id,
            "run_output": self._build_run_output(
                script_id=script_id,
                parsed_result=parsed_result,
                target_date=target_date,
                provider_metadata=provider_metadata,
            ),
        }

    @staticmethod
    def _build_run_output(
        *,
        script_id: str,
        parsed_result: dict[str, Any],
        target_date: str,
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """构造每日推盘流水线输出载荷。"""
        payload = {
            "script_id": script_id,
            "result": parsed_result,
            "target_date": target_date,
            "is_daily_push": True,
        }
        if provider_metadata:
            payload["provider"] = provider_metadata
        return payload

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


class DailyPushPipelineService:
    """负责每日推盘异步流水线的定义、创建与推进。"""

    def __init__(
        self,
        *,
        workflow_provider: WorkflowProvider,
        vector_store: VectorStore,
        persistence_service: DailyPushPersistenceService,
        pipeline_runner,
        fragment_selector: DailyPushFragmentSelector | None = None,
    ) -> None:
        """装配每日推盘流水线依赖。"""
        self.workflow_provider = workflow_provider
        self.fragment_selector = fragment_selector or DailyPushFragmentSelector(vector_store=vector_store)
        self.persistence_service = persistence_service
        self.pipeline_runner = pipeline_runner

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
    ) -> PipelineRun:
        """为指定用户创建每日推盘流水线，必要时复用当天已有结果。"""
        target_time = reference_time or datetime.now(timezone.utc)
        today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
        existing_script = script_repository.get_latest_daily_push_for_window(
            db=db,
            user_id=user_id,
            start_at=today_start,
            end_at=today_end,
        )
        if existing_script:
            existing_run = pipeline_repository.get_latest_run_by_resource(
                db=db,
                user_id=user_id,
                pipeline_type=PIPELINE_TYPE_DAILY_PUSH_GENERATION,
                resource_type="script",
                resource_id=existing_script.id,
            )
            if existing_run:
                return existing_run
        existing_active_run = pipeline_repository.get_latest_run_by_type_in_window(
            db=db,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_DAILY_PUSH_GENERATION,
            start_at=today_start,
            end_at=today_end,
            statuses=["queued", "running", "succeeded"],
        )
        if existing_active_run:
            return existing_active_run

        source_start, source_end = get_local_day_bounds(target_time, day_offset=source_day_offset)
        recent_fragments = fragment_repository.list_content_ready_in_range(
            db=db,
            user_id=user_id,
            start_at=source_start,
            end_at=source_end,
        )
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(
                message=f"今天至少需要 {settings.DAILY_PUSH_MIN_FRAGMENTS} 条已转写碎片，才能生成灵感卡片",
                field_errors={"fragments": "碎片数量不足"},
            )
        selected = recent_fragments if force else await self.fragment_selector.select_related_fragments(user_id=user_id, fragments=recent_fragments)
        if len(selected) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            raise ValidationError(message="今天的碎片主题还不够集中，暂时无法生成灵感卡片", field_errors={"fragments": "语义关联不足"})

        local_date = target_time.astimezone(get_app_timezone()).date().isoformat()
        return await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_DAILY_PUSH_GENERATION,
            input_payload={
                "fragment_ids": [fragment.id for fragment in selected],
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
        user_ids = {row[0] for row in db.query(User.id).all()}
        user_ids.update(row[0] for row in db.query(Fragment.user_id).filter(Fragment.user_id.isnot(None)).distinct().all())
        for user_id in sorted(user_ids):
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

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回每日推盘流水线的固定步骤。"""
        return [
            PipelineStepDefinition(step_name="collect_daily_push_context", executor=self.collect_daily_push_context, max_attempts=1),
            PipelineStepDefinition(step_name="submit_daily_push_workflow", executor=self.submit_daily_push_workflow, max_attempts=2),
            PipelineStepDefinition(
                step_name="poll_daily_push_workflow",
                executor=self.poll_daily_push_workflow,
                max_attempts=_build_poll_max_attempts(settings.DIFY_POLL_TIMEOUT_SECONDS),
            ),
            PipelineStepDefinition(step_name="persist_daily_push_script", executor=self.persist_daily_push_script, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_daily_push_run", executor=self.finalize_daily_push_run, max_attempts=1),
        ]

    def _runtime_workflow_provider(self, context: PipelineExecutionContext) -> WorkflowProvider:
        """按当前容器状态读取每日推盘运行时 provider。"""
        return context.container.daily_push_workflow_provider

    async def collect_daily_push_context(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """根据已选碎片组装每日推盘工作流上下文。"""
        payload = context.input_payload
        fragments = fragment_repository.get_by_ids(
            db=context.db,
            user_id=context.run.user_id,
            fragment_ids=payload["fragment_ids"],
        )
        fragment_map = {fragment.id: fragment for fragment in fragments}
        ordered_fragments = [fragment_map[fragment_id] for fragment_id in payload["fragment_ids"] if fragment_id in fragment_map]
        if len(ordered_fragments) != len(payload["fragment_ids"]):
            raise ValidationError(message="每日推盘引用的碎片不存在或无权访问", field_errors={"fragment_ids": "碎片缺失"})
        content_parts = [_fragment_content(fragment) for fragment in ordered_fragments if _fragment_content(fragment)]
        if not content_parts:
            raise ValidationError(message="选中的碎片均无可用文本，无法生成每日推盘", field_errors={"fragment_ids": "碎片内容为空"})
        daily_push_context = DailyPushContext(
            mode="mode_a",
            selected_fragments=[_build_fragment_payload(fragment) for fragment in ordered_fragments],
            fragments_text="\n\n---\n\n".join(content_parts),
            target_date=payload["target_date"],
            trigger_kind=payload["trigger_kind"],
            force=bool(payload.get("force")),
            generation_metadata={
                "source_day_offset": payload.get("source_day_offset"),
                "source_window_start": payload.get("source_window_start"),
                "source_window_end": payload.get("source_window_end"),
            },
        )
        return {"daily_push_context": daily_push_context.to_dict()}

    async def submit_daily_push_workflow(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """向每日推盘 workflow provider 提交运行。"""
        workflow_context = context.get_step_output("collect_daily_push_context").get("daily_push_context") or {}
        workflow_run = await self._runtime_workflow_provider(context).submit_run(
            inputs=build_daily_push_workflow_inputs(DailyPushContext(**workflow_context)),
            user_id=context.run.user_id,
        )
        provider_run_id = workflow_run.provider_run_id or workflow_run.run_id
        return {
            "provider_run_id": provider_run_id,
            "provider_task_id": workflow_run.provider_task_id,
            "workflow_id": workflow_run.provider_workflow_id,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {
                "provider_run_id": provider_run_id,
                "provider_task_id": workflow_run.provider_task_id,
            },
        }

    async def poll_daily_push_workflow(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """查询每日推盘 workflow provider 的最新运行状态。"""
        provider_run_id = context.get_step_output("submit_daily_push_workflow").get("provider_run_id")
        submit_task_id = context.get_step_output("submit_daily_push_workflow").get("provider_task_id")
        if not provider_run_id:
            raise ValidationError(message="每日推盘工作流尚未成功提交到 provider", field_errors={"run_id": "缺少 provider 运行 ID"})
        workflow_run = await self._runtime_workflow_provider(context).get_run(run_id=provider_run_id)
        parsed = self.persistence_service.parse_outputs(workflow_run.outputs)
        if workflow_run.status in FAILED_STATUSES:
            raise PipelineExecutionError(self.persistence_service.resolve_failure_message(workflow_run.raw_payload), retryable=False)
        if workflow_run.status not in SUCCESS_STATUSES:
            raise PipelineExecutionError("workflow still running", retryable=True)
        provider_run_id = workflow_run.provider_run_id or provider_run_id
        provider_task_id = workflow_run.provider_task_id or submit_task_id
        return {
            "workflow_id": workflow_run.provider_workflow_id,
            "provider_run_id": provider_run_id,
            "provider_task_id": provider_task_id,
            "result": parsed,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {
                "provider_run_id": provider_run_id,
                "provider_task_id": provider_task_id,
            },
        }

    async def persist_daily_push_script(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """在 workflow 成功后回流创建每日推盘脚本记录。"""
        payload = context.input_payload
        poll_payload = context.get_step_output("poll_daily_push_workflow")
        return self.persistence_service.persist_script(
            db=context.db,
            run=context.run,
            input_payload=payload,
            parsed_result=poll_payload.get("result") or {},
            provider_metadata=self.persistence_service.build_provider_metadata(
                workflow_id=poll_payload.get("workflow_id"),
                provider_run_id=poll_payload.get("provider_run_id"),
                provider_task_id=poll_payload.get("provider_task_id"),
            ),
        )

    async def finalize_daily_push_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束每日推盘流水线并固化最终脚本结果。"""
        payload = context.input_payload
        persist_payload = context.get_step_output("persist_daily_push_script")
        return self.persistence_service.build_finalize_payload(
            script_id=persist_payload["script_id"],
            parsed_result=persist_payload.get("result") or {},
            target_date=payload["target_date"],
            provider_metadata=persist_payload.get("provider"),
        )


def build_daily_push_pipeline_service(container) -> DailyPushPipelineService:
    """基于容器组装每日推盘流水线服务。"""
    return DailyPushPipelineService(
        workflow_provider=container.daily_push_workflow_provider,
        vector_store=container.vector_store,
        persistence_service=DailyPushPersistenceService(),
        pipeline_runner=container.pipeline_runner,
    )
