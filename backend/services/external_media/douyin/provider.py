from __future__ import annotations

import asyncio
from pathlib import Path

from core.exceptions import AppException, ValidationError
from modules.shared.ports import ExternalMediaResolvedAudio

from ..ffmpeg_audio import FfmpegAudioExtractor
from .parser import DouyinVideoParser


class DouyinProvider:
    def __init__(
        self,
        *,
        parser: DouyinVideoParser | None = None,
        extractor: FfmpegAudioExtractor | None = None,
    ) -> None:
        self.parser = parser or DouyinVideoParser()
        self.extractor = extractor or FfmpegAudioExtractor()

    async def resolve_audio(self, *, share_url: str) -> ExternalMediaResolvedAudio:
        return await asyncio.to_thread(self._resolve_audio_sync, share_url)

    def _resolve_audio_sync(self, share_url: str) -> ExternalMediaResolvedAudio:
        info = self.parser.parse_video(share_url)
        if not info:
            raise AppException(
                message="抖音内容解析失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
            )
        if info.get("content_type") != "video":
            raise ValidationError(message="当前链接不是可导入音频的视频", field_errors={"share_url": "仅支持抖音视频链接"})

        qualities = info.get("qualities") or []
        audio_source_url = qualities[0]["url"] if qualities else info.get("nwm_url")
        if not audio_source_url:
            raise AppException(
                message="未找到可用的视频流地址",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
            )

        media_id = str(info.get("aweme_id") or "").strip()
        if not media_id:
            raise AppException(
                message="抖音内容缺少媒体 ID",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
            )

        local_audio_path = self.extractor.extract_from_url(media_url=audio_source_url, output_stem=media_id)
        return ExternalMediaResolvedAudio(
            platform="douyin",
            share_url=share_url,
            media_id=media_id,
            title=info.get("desc"),
            author=info.get("author_nickname"),
            cover_url=info.get("cover_url"),
            content_type=str(info.get("content_type") or "video"),
            local_audio_path=str(Path(local_audio_path).resolve()),
        )
