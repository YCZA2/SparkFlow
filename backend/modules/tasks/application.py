from __future__ import annotations

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError
from domains.tasks import repository as task_repository
from models import TaskRun
from utils.serialization import format_iso_datetime

from .schemas import TaskResourcePreview, TaskRunResponse, TaskStepListResponse, TaskStepResponse


def map_task_run(run: TaskRun) -> TaskRunResponse:
    """将任务运行记录映射为 API 响应。"""
    output = task_repository.load_json(run.output_payload_json)
    return TaskRunResponse(
        id=run.id,
        task_type=run.task_type,
        status=run.status,
        current_step=run.current_step,
        error_message=run.error_message,
        celery_root_id=run.celery_root_id,
        resource=TaskResourcePreview(resource_type=run.resource_type, resource_id=run.resource_id),
        output=output,
        created_at=format_iso_datetime(run.created_at),
        updated_at=format_iso_datetime(run.updated_at),
        finished_at=format_iso_datetime(run.finished_at),
    )


class TaskQueryService:
    """提供统一任务查询能力。"""

    def get_run(self, *, db: Session, user_id: str, run_id: str) -> TaskRun:
        """读取当前用户的单条任务记录。"""
        run = task_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if not run:
            raise NotFoundError(message="任务不存在或无权访问", resource_type="task_run", resource_id=run_id)
        return run

    def list_steps(self, *, db: Session, user_id: str, run_id: str) -> TaskStepListResponse:
        """按顺序返回任务步骤详情。"""
        run = self.get_run(db=db, user_id=user_id, run_id=run_id)
        return TaskStepListResponse(
            items=[
                TaskStepResponse(
                    step_name=step.step_name,
                    status=step.status,
                    attempt_count=step.attempt_count,
                    max_attempts=step.max_attempts,
                    celery_task_id=step.celery_task_id,
                    error_message=step.error_message,
                    output=task_repository.load_json(step.output_payload_json),
                    external_ref=task_repository.load_json(step.external_ref_json),
                    started_at=format_iso_datetime(step.started_at),
                    finished_at=format_iso_datetime(step.finished_at),
                )
                for step in sorted(run.steps, key=lambda item: item.step_order)
            ]
        )
