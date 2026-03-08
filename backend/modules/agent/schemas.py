from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ScriptResearchRunCreateRequest(BaseModel):
    fragment_ids: list[str] = Field(..., description="选中的碎片 ID 列表", min_length=1, max_length=20)
    mode: str = Field(..., description="生成模式：mode_a 或 mode_b")
    query_hint: str | None = Field(None, description="可选的研究问题或写作目标")
    include_web_search: bool = Field(False, description="是否补充网页搜索结果")


class AgentRunResult(BaseModel):
    title: str | None = None
    outline: str | None = None
    draft: str | None = None
    used_sources: list[dict[str, Any]] = Field(default_factory=list)
    review_notes: str | None = None


class AgentRunDetail(BaseModel):
    id: str
    workflow_type: Literal["script_research"]
    status: Literal["queued", "running", "succeeded", "failed"]
    mode: str
    query_hint: str | None = None
    include_web_search: bool
    source_fragment_ids: list[str] = Field(default_factory=list)
    dify_workflow_id: str | None = None
    dify_run_id: str | None = None
    script_id: str | None = None
    error_message: str | None = None
    result: AgentRunResult | None = None
    created_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None

