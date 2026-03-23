from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PipelineResourcePreview(BaseModel):
    resource_type: str | None = None
    resource_id: str | None = None


class PipelineRunResponse(BaseModel):
    id: str
    pipeline_type: Literal["media_ingestion", "script_generation", "daily_push_generation", "rag_script_generation"]
    status: str
    current_step: str | None = None
    error_message: str | None = None
    resource: PipelineResourcePreview = Field(default_factory=PipelineResourcePreview)
    output: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None


class PipelineStepResponse(BaseModel):
    step_name: str
    status: str
    attempt_count: int
    max_attempts: int
    error_message: str | None = None
    output: dict[str, Any] = Field(default_factory=dict)
    external_ref: dict[str, Any] = Field(default_factory=dict)
    started_at: str | None = None
    finished_at: str | None = None


class PipelineStepListResponse(BaseModel):
    items: list[PipelineStepResponse]


class RetryPipelineRequest(BaseModel):
    strategy: Literal["from_failed_step", "from_start"] = Field(
        default="from_failed_step",
        description="失败后默认从失败步骤续跑，也支持整条链路重跑。",
    )
