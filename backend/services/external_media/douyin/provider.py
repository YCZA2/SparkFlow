from __future__ import annotations

import asyncio
from pathlib import Path

from core.exceptions import AppException, ValidationError
from core.logging_config import get_logger
from modules.shared.ports import ExternalMediaResolvedAudio

from ..ffmpeg_audio import FfmpegAudioExtractor
from .parser import DouyinVideoParser

logger = get_logger(__name__)


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
        """在线程池中执行抖音解析与音频提取。"""
        return await asyncio.to_thread(self._resolve_audio_sync, share_url)

    def _resolve_audio_sync(self, share_url: str) -> ExternalMediaResolvedAudio:
        """同步完成抖音视频解析和音频抽取。"""
        logger.info("douyin_resolve_audio_start", share_url=share_url)
        info = self.parser.parse_video(share_url)
        if not info:
            logger.warning("douyin_parse_video_failed", share_url=share_url)
            raise AppException(
                message="抖音内容解析失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
            )
        if info.get("content_type") != "video":
            logger.warning("douyin_content_type_not_video", share_url=share_url, content_type=info.get("content_type"))
            raise ValidationError(message="当前链接不是可导入音频的视频", field_errors={"share_url": "仅支持抖音视频链接"})

        media_id = str(info.get("aweme_id") or "").strip()
        if not media_id:
            logger.warning("douyin_media_id_missing", share_url=share_url)
            raise ValidationError(message="抖音内容缺少媒体 ID", field_errors={"share_url": "当前链接缺少可识别的视频标识"})

        request_headers = self._build_media_request_headers(media_id=media_id)
        audio_source_url = self._pick_audio_source_url(info, request_headers=request_headers)
        if not audio_source_url:
            logger.warning("douyin_audio_stream_missing", share_url=share_url, media_id=info.get("aweme_id"))
            raise AppException(
                message="未找到可用的视频流地址",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
            )
        local_audio_path = self.extractor.extract_from_url(
            media_url=audio_source_url,
            output_stem=media_id,
            request_headers=request_headers,
        )
        logger.info("douyin_resolve_audio_succeeded", share_url=share_url, media_id=media_id, content_type=info.get("content_type"))
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

    def _pick_audio_source_url(
        self,
        info: dict,
        *,
        request_headers: dict[str, str] | None = None,
    ) -> str | None:
        """中文注释：当前只为转写取音频，优先低码率且必须带音频轨。"""
        qualities = info.get("qualities") or []
        candidates = [item for item in qualities if isinstance(item, dict) and item.get("url")]
        if not candidates:
            return info.get("nwm_url")

        def sort_key(item: dict) -> tuple[int, int, str]:
            bit_rate = int(item.get("bit_rate") or 0)
            ratio = str(item.get("ratio") or "")
            ratio_order = {"360p": 1, "480p": 2, "540p": 3, "720p": 4, "1080p": 5}
            return (bit_rate, ratio_order.get(ratio, 99), str(item.get("url") or ""))

        for candidate in sorted(candidates, key=sort_key):
            stream_types = self.extractor.probe_stream_types(
                media_url=str(candidate.get("url")),
                request_headers=request_headers,
            )
            if "audio" in stream_types:
                logger.info(
                    "douyin_audio_source_selected",
                    aweme_id=info.get("aweme_id"),
                    bit_rate=candidate.get("bit_rate"),
                    ratio=candidate.get("ratio"),
                    quality_label=candidate.get("quality_label"),
                    stream_types=stream_types,
                )
                return str(candidate.get("url"))
            logger.info(
                "douyin_audio_source_skipped_no_audio",
                aweme_id=info.get("aweme_id"),
                bit_rate=candidate.get("bit_rate"),
                ratio=candidate.get("ratio"),
                quality_label=candidate.get("quality_label"),
                stream_types=stream_types,
            )

        fallback = min(candidates, key=sort_key)
        logger.warning(
            "douyin_audio_source_probe_exhausted",
            aweme_id=info.get("aweme_id"),
            fallback_bit_rate=fallback.get("bit_rate"),
            fallback_ratio=fallback.get("ratio"),
        )
        return str(fallback.get("url"))

    def _build_media_request_headers(self, *, media_id: str) -> dict[str, str]:
        """中文注释：抖音视频流请求需要携带页面来源和浏览器头，避免 CDN 返回 403。"""
        headers = {
            "User-Agent": getattr(self.parser, "user_agent", "") or (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/90.0.4430.212 Safari/537.36"
            ),
            "Referer": f"https://www.douyin.com/video/{media_id}",
            "Origin": "https://www.douyin.com",
            "Accept": "*/*",
        }
        cookie = getattr(self.parser, "cookie", "") or ""
        if cookie:
            headers["Cookie"] = cookie
        return headers
