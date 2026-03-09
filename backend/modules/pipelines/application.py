from __future__ import annotations

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError
from domains.pipelines import repository as pipeline_repository
from models import PipelineRun
from utils.serialization import format_iso_datetime

from .schemas import PipelineResourcePreview, PipelineRunResponse, PipelineStepListResponse, PipelineStepResponse


def map_pipeline_run(run: PipelineRun) -> PipelineRunResponse:
    """将流水线运行记录映射为 API 响应。"""
    output = pipeline_repository.load_json(run.output_payload_json)
    return PipelineRunResponse(
        id=run.id,
        pipeline_type=run.pipeline_type,  # type: ignore[arg-type]
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
    """提供流水线查询能力。"""

    def get_run(self, *, db: Session, user_id: str, run_id: str) -> PipelineRun:
        """读取当前用户的单条流水线记录。"""
        run = pipeline_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if not run:
            raise NotFoundError(message="流水线不存在或无权访问", resource_type="pipeline_run", resource_id=run_id)
        return run

    def list_steps(self, *, db: Session, user_id: str, run_id: str) -> PipelineStepListResponse:
        """按顺序返回流水线步骤详情。"""
        run = self.get_run(db=db, user_id=user_id, run_id=run_id)
        return PipelineStepListResponse(
            items=[
                PipelineStepResponse(
                    step_name=step.step_name,
                    status=step.status,
                    attempt_count=step.attempt_count,
                    max_attempts=step.max_attempts,
                    error_message=step.error_message,
                    output=pipeline_repository.load_json(step.output_payload_json),
                    external_ref=pipeline_repository.load_json(step.external_ref_json),
                    started_at=format_iso_datetime(step.started_at),
                    finished_at=format_iso_datetime(step.finished_at),
                )
                for step in sorted(run.steps, key=lambda item: item.step_order)
            ]
        )
