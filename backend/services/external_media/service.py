from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse

from core.exceptions import ValidationError
from modules.shared.ports import ExternalMediaResolvedAudio

from .douyin.provider import DouyinProvider


class ExternalMediaService:
    def __init__(self, *, douyin_provider: DouyinProvider | None = None) -> None:
        self.douyin_provider = douyin_provider or DouyinProvider()

    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio:
        normalized_platform = (platform or "auto").lower()
        if normalized_platform not in {"auto", "douyin"}:
            raise ValidationError(message="不支持的平台", field_errors={"platform": "仅支持 auto 或 douyin"})

        if normalized_platform == "douyin" or self._is_douyin_url(share_url):
            return await self.douyin_provider.resolve_audio(share_url=share_url)

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
