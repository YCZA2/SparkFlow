from __future__ import annotations

from pydantic import BaseModel, Field


class ScriptGenerationFragmentSnapshot(BaseModel):
    id: str = Field(..., description="本地 fragment ID")
    body_html: str | None = Field(None, description="HTML 正文")
    plain_text_snapshot: str | None = Field(None, description="纯文本快照")
    summary: str | None = Field(None, description="摘要")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    source: str = Field("manual", description="来源")
    created_at: str | None = Field(None, description="创建时间")


class ScriptGenerationRequest(BaseModel):
    fragment_ids: list[str] = Field(default_factory=list, description="选中的远端碎片 ID 列表", max_length=20)
    fragment_snapshots: list[ScriptGenerationFragmentSnapshot] = Field(
        default_factory=list,
        description="local-first 场景下由客户端直接上传的 fragment 快照",
        max_length=20,
    )
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
