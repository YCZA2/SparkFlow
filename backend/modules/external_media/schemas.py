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
    source: str
    audio_source: str
