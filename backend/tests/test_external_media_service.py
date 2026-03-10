"""外部媒体服务测试。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from core.config import settings
from core.exceptions import AppException, ValidationError
from services.external_media.douyin.parser import DouyinVideoParser
from services.external_media.douyin.provider import DouyinProvider
from services.external_media.ffmpeg_audio import FfmpegAudioExtractor
from services.external_media.service import ExternalMediaService


@pytest.mark.asyncio
async def test_resolve_audio_rejects_unknown_platform() -> None:
    """未知平台应被立即拒绝。"""
    service = ExternalMediaService(douyin_provider=SimpleNamespace(resolve_audio=None))
    with pytest.raises(ValidationError):
        await service.resolve_audio(share_url="https://v.douyin.com/test", platform="kuaishou")


@pytest.mark.asyncio
async def test_resolve_audio_rejects_non_douyin_url_in_auto_mode() -> None:
    """自动识别模式下非抖音链接应报校验错误。"""
    service = ExternalMediaService(douyin_provider=SimpleNamespace(resolve_audio=None))
    with pytest.raises(ValidationError):
        await service.resolve_audio(share_url="https://example.com/video", platform="auto")


@pytest.mark.asyncio
async def test_resolve_audio_maps_metadata_and_extracts_audio() -> None:
    """抖音 provider 应正确映射元数据并返回音频路径。"""
    parser = SimpleNamespace(
        parse_video=lambda share_url: {
            "aweme_id": "123456",
            "desc": "标题",
            "author_nickname": "作者",
            "cover_url": "https://example.com/cover.jpg",
            "content_type": "video",
            "qualities": [{"url": "https://example.com/video.mp4"}],
        }
    )
    extractor = SimpleNamespace(extract_from_url=lambda **kwargs: "/tmp/test.m4a")
    provider = DouyinProvider(parser=parser, extractor=extractor)

    result = await provider.resolve_audio(share_url="https://v.douyin.com/test")
    assert result.platform == "douyin"
    assert result.media_id == "123456"
    assert result.local_audio_path.endswith("/test.m4a")


@pytest.mark.asyncio
async def test_resolve_audio_rejects_non_video_content() -> None:
    """非视频内容不应进入音频提取流程。"""
    parser = SimpleNamespace(parse_video=lambda share_url: {"content_type": "image"})
    provider = DouyinProvider(parser=parser, extractor=SimpleNamespace())
    with pytest.raises(ValidationError):
        await provider.resolve_audio(share_url="https://v.douyin.com/test")


@pytest.mark.asyncio
async def test_resolve_audio_logs_when_parse_fails(capsys) -> None:
    """解析失败时应输出可排障日志。"""
    parser = SimpleNamespace(parse_video=lambda share_url: None)
    provider = DouyinProvider(parser=parser, extractor=SimpleNamespace())

    with pytest.raises(AppException):
        await provider.resolve_audio(share_url="https://v.douyin.com/test")

    captured = capsys.readouterr()
    assert "douyin_parse_video_failed" in captured.out


def test_parser_loads_cookie_from_settings() -> None:
    """抖音解析器应从全局设置读取 cookie。"""
    original_cookie = settings.DOUYIN_COOKIE
    settings.DOUYIN_COOKIE = "test_cookie=value"
    try:
        parser = DouyinVideoParser()
        assert parser.cookie == "test_cookie=value"
    finally:
        settings.DOUYIN_COOKIE = original_cookie


def test_extract_from_url_reports_missing_ffmpeg() -> None:
    """缺少 ffmpeg 可执行文件时应抛出导入失败异常。"""
    extractor = FfmpegAudioExtractor(executable="ffmpeg")
    with patch("services.external_media.ffmpeg_audio.shutil.which", return_value=None):
        with pytest.raises(AppException) as ctx:
            extractor.extract_from_url(media_url="https://example.com/video.mp4", output_stem="demo")
    assert ctx.value.code == "EXTERNAL_MEDIA_IMPORT_FAILED"


def test_extract_from_url_reports_subprocess_failure() -> None:
    """ffmpeg 执行失败时应抛出导入失败异常。"""
    extractor = FfmpegAudioExtractor(executable="ffmpeg")
    with patch("services.external_media.ffmpeg_audio.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"):
        with patch(
            "services.external_media.ffmpeg_audio.subprocess.run",
            return_value=SimpleNamespace(returncode=1, stderr="boom", stdout=""),
        ):
            with pytest.raises(AppException) as ctx:
                extractor.extract_from_url(media_url="https://example.com/video.mp4", output_stem="demo")
    assert ctx.value.code == "EXTERNAL_MEDIA_IMPORT_FAILED"
