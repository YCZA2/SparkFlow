from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TaskResourcePreview(BaseModel):
    resource_type: str | None = None
    resource_id: str | None = None


class TaskRunResponse(BaseModel):
    id: str
    task_type: str
    status: str
    current_step: str | None = None
    error_message: str | None = None
    celery_root_id: str | None = None
    resource: TaskResourcePreview = Field(default_factory=TaskResourcePreview)
    output: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None


class TaskStepResponse(BaseModel):
    step_name: str
    status: str
    attempt_count: int
    max_attempts: int
    celery_task_id: str | None = None
    error_message: str | None = None
    output: dict[str, Any] = Field(default_factory=dict)
    external_ref: dict[str, Any] = Field(default_factory=dict)
    started_at: str | None = None
    finished_at: str | None = None


class TaskStepListResponse(BaseModel):
    items: list[TaskStepResponse]


class RetryTaskRequest(BaseModel):
    strategy: Literal["from_failed_step", "from_start"] = Field(
        default="from_failed_step",
        description="失败后默认从失败步骤续跑，也支持整条链路重跑。",
    )


class TaskSubmissionHandle(BaseModel):
    task_id: str
    task_type: str
    status_query_url: str
