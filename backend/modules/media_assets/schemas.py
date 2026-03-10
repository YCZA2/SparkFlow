from __future__ import annotations

from pydantic import BaseModel, Field

from modules.shared.content_schemas import MediaAssetItem


class MediaAssetListResponse(BaseModel):
    items: list[MediaAssetItem]
    total: int
    limit: int
    offset: int


class MediaAssetUploadResponse(MediaAssetItem):
    public_url: str | None = None


class MediaAssetAttachRequest(BaseModel):
    content_type: str = Field(..., description="内容类型：fragment / script / knowledge")
    content_id: str = Field(..., description="内容 ID")
    media_asset_id: str = Field(..., description="媒体资源 ID")
