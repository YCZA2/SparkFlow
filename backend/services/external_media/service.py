from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse

from core.exceptions import ValidationError
from core.logging_config import get_logger
from modules.shared.ports import ExternalMediaResolvedAudio

from .douyin.provider import DouyinProvider

logger = get_logger(__name__)


class ExternalMediaService:
    def __init__(self, *, douyin_provider: DouyinProvider | None = None) -> None:
        self.douyin_provider = douyin_provider or DouyinProvider()

    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio:
        """根据平台分发外链解析请求。"""
        normalized_platform = (platform or "auto").lower()
        if normalized_platform not in {"auto", "douyin"}:
            logger.warning("external_media_platform_unsupported", platform=platform, share_url=share_url)
            raise ValidationError(message="不支持的平台", field_errors={"platform": "仅支持 auto 或 douyin"})

        if normalized_platform == "douyin" or self._is_douyin_url(share_url):
            logger.info("external_media_resolve_start", platform="douyin", share_url=share_url)
            return await self.douyin_provider.resolve_audio(share_url=share_url)

        logger.warning("external_media_share_url_unrecognized", platform=platform, share_url=share_url)
        raise ValidationError(message="无法识别外部媒体链接", field_errors={"share_url": "当前仅支持抖音分享链接"})

    async def health_check(self) -> bool:
        return True

    @staticmethod
    def _is_douyin_url(share_url: str) -> bool:
        lowered = (share_url or "").lower()
        if "douyin.com" in lowered or "v.douyin.com" in lowered:
            return True
        parsed = urlparse(share_url if "://" in share_url else f"https://{share_url}")
        return parsed.netloc.endswith("douyin.com")

    @staticmethod
    async def cleanup_temp_file(path: str | None) -> None:
        if not path:
            return
        try:
            await asyncio.to_thread(os.unlink, path)
        except FileNotFoundError:
            pass
        except IsADirectoryError:
            pass
