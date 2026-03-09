from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExternalAudioImportRequest(BaseModel):
    share_url: str = Field(..., description="外部媒体分享链接")
    platform: Literal["auto", "douyin"] = Field("auto", description="平台：auto 或 douyin")


class ExternalAudioImportResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    fragment_id: str | None = None
    sync_status: str
    source: str
    audio_source: str
    platform: str | None = None
    share_url: str | None = None
    media_id: str | None = None
    title: str | None = None
    author: str | None = None
    cover_url: str | None = None
    content_type: str | None = None
    audio_relative_path: str | None = None
    audio_public_url: str | None = None
