from __future__ import annotations

from pydantic import BaseModel, Field


class KnowledgeDocCreateRequest(BaseModel):
    title: str = Field(..., description="文档标题")
    content: str = Field(..., description="文档内容")
    body_markdown: str | None = Field(None, description="Markdown 正文")
    doc_type: str = Field(..., description="文档类型：high_likes 或 language_habit")


class KnowledgeDocUpdateRequest(BaseModel):
    title: str | None = Field(None, description="文档标题")
    body_markdown: str | None = Field(None, description="Markdown 正文")


class KnowledgeSearchRequest(BaseModel):
    query_text: str = Field(..., description="查询文本")
    top_k: int = Field(5, ge=1, le=20, description="返回结果数量")


class KnowledgeDocItem(BaseModel):
    id: str
    title: str
    content: str
    body_markdown: str | None = None
    doc_type: str
    vector_ref_id: str | None = None
    created_at: str | None = None


class KnowledgeDocListResponse(BaseModel):
    items: list[KnowledgeDocItem]
    total: int
    limit: int
    offset: int


class KnowledgeSearchItem(KnowledgeDocItem):
    score: float


class KnowledgeSearchResponse(BaseModel):
    items: list[KnowledgeSearchItem]
    total: int
    query_text: str
