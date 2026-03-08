from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExternalAudioImportRequest(BaseModel):
    share_url: str = Field(..., description="外部媒体分享链接")
    platform: Literal["auto", "douyin"] = Field("auto", description="平台：auto 或 douyin")


class ExternalAudioImportResponse(BaseModel):
    platform: str
    share_url: str
    media_id: str
    title: str | None = None
    author: str | None = None
    cover_url: str | None = None
    content_type: str
    audio_relative_path: str
    audio_public_url: str
