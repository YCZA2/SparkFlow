from __future__ import annotations

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError
from domains.pipelines import repository as pipeline_repository
from domains.tasks import repository as task_repository
from models import PipelineRun, TaskRun
from utils.serialization import format_iso_datetime

from .schemas import PipelineResourcePreview, PipelineRunResponse, PipelineStepListResponse, PipelineStepResponse


def map_pipeline_run(run: PipelineRun | TaskRun) -> PipelineRunResponse:
    """将 legacy pipeline 或新 task 记录映射为兼容 API 响应。"""
    output_loader = task_repository.load_json if isinstance(run, TaskRun) else pipeline_repository.load_json
    output = output_loader(run.output_payload_json)
    return PipelineRunResponse(
        id=run.id,
        pipeline_type=getattr(run, "pipeline_type", getattr(run, "task_type", "")),  # type: ignore[arg-type]
        status=run.status,
        current_step=run.current_step,
        error_message=run.error_message,
        resource=PipelineResourcePreview(resource_type=run.resource_type, resource_id=run.resource_id),
        output=output,
        created_at=format_iso_datetime(run.created_at),
        updated_at=format_iso_datetime(run.updated_at),
        finished_at=format_iso_datetime(run.finished_at),
    )


class PipelineQueryService:
    """提供 legacy pipeline 查询能力，并兼容读取新 task。"""

    def get_run(self, *, db: Session, user_id: str, run_id: str) -> PipelineRun | TaskRun:
        """优先读取新任务记录，缺失时回退 legacy pipeline。"""
        run = task_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if run:
            return run
        run = pipeline_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if not run:
            raise NotFoundError(message="流水线不存在或无权访问", resource_type="pipeline_run", resource_id=run_id)
        return run

    def list_steps(self, *, db: Session, user_id: str, run_id: str) -> PipelineStepListResponse:
        """按顺序返回流水线步骤详情，兼容新 task。"""
        run = self.get_run(db=db, user_id=user_id, run_id=run_id)
        json_loader = task_repository.load_json if isinstance(run, TaskRun) else pipeline_repository.load_json
        return PipelineStepListResponse(
            items=[
                PipelineStepResponse(
                    step_name=step.step_name,
                    status=step.status,
                    attempt_count=step.attempt_count,
                    max_attempts=step.max_attempts,
                    error_message=step.error_message,
                    output=json_loader(step.output_payload_json),
                    external_ref=json_loader(step.external_ref_json),
                    started_at=format_iso_datetime(step.started_at),
                    finished_at=format_iso_datetime(step.finished_at),
                )
                for step in sorted(run.steps, key=lambda item: item.step_order)
            ]
        )
