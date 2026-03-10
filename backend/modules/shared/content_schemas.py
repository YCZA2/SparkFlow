from __future__ import annotations

from pydantic import BaseModel, Field


class MediaAssetItem(BaseModel):
    id: str
    media_kind: str
    original_filename: str
    mime_type: str
    file_size: int
    checksum: str | None = None
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    status: str
    created_at: str | None = None
    file_url: str | None = None
    expires_at: str | None = None


class FragmentBlockItem(BaseModel):
    id: str
    type: str
    order_index: int
    markdown: str | None = None


class FragmentBlockInput(BaseModel):
    type: str = Field(..., description="块类型，当前仅支持 markdown")
    markdown: str | None = Field(None, description="Markdown 块正文")


class MarkdownExportItem(BaseModel):
    filename: str
    content: str
