from __future__ import annotations

from pydantic import BaseModel, Field


class ScriptGenerationRequest(BaseModel):
    fragment_ids: list[str] = Field(..., description="选中的碎片 ID 列表", min_length=1, max_length=20)
    mode: str = Field(..., description="生成模式：mode_a (导师爆款) 或 mode_b (专属二脑)")
    query_hint: str | None = Field(None, description="可选的生成提示词或研究问题")
    include_web_search: bool = Field(False, description="是否额外补充网页搜索结果")


class ScriptGenerationResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    status: str


class ScriptUpdateRequest(BaseModel):
    status: str | None = Field(None, description="更新状态: draft, ready, filmed")
    title: str | None = Field(None, description="更新标题")


class ScriptItem(BaseModel):
    id: str
    title: str | None = None
    mode: str
    source_fragment_count: int = 0
    status: str
    is_daily_push: bool
    created_at: str | None = None


class ScriptDetail(ScriptItem):
    content: str | None = None
    source_fragment_ids: list[str] = Field(default_factory=list)


class ScriptListResponse(BaseModel):
    items: list[ScriptItem]
    total: int
    limit: int
    offset: int
