from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExternalAudioImportRequest(BaseModel):
    share_url: str = Field(..., description="外部媒体分享链接")
    platform: Literal["auto", "douyin"] = Field("auto", description="平台：auto 或 douyin")
    folder_id: str | None = Field(None, description="目标文件夹 ID，不传表示放入全部")
    local_fragment_id: str = Field(..., description="本地占位 fragment ID")


class ExternalAudioImportResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    fragment_id: str | None = None
    local_fragment_id: str | None = None
    source: str
    audio_source: str
