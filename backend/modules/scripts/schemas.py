from __future__ import annotations

from pydantic import BaseModel, Field


class ScriptGenerationRequest(BaseModel):
    topic: str = Field(..., description="脚本主题（必填），作为大纲生成和向量检索的核心输入", min_length=1, max_length=200)
    fragment_ids: list[str] = Field(default_factory=list, description="可选碎片 ID 列表，内容作为补充背景注入脚本", max_length=20)


class ScriptGenerationResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    status: str


class ScriptUpdateRequest(BaseModel):
    status: str | None = Field(None, description="更新状态: draft, ready, filmed")
    title: str | None = Field(None, description="更新标题")
    body_html: str | None = Field(None, description="更新 HTML 正文")


class ScriptItem(BaseModel):
    id: str
    title: str | None = None
    mode: str
    source_fragment_count: int = 0
    status: str
    is_daily_push: bool
    created_at: str | None = None


class ScriptDetail(ScriptItem):
    body_html: str | None = None
    source_fragment_ids: list[str] = Field(default_factory=list)


class ScriptListResponse(BaseModel):
    items: list[ScriptItem]
    total: int
    limit: int
    offset: int
