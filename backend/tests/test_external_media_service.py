"""外部媒体服务测试。"""

from __future__ import annotations

from pathlib import Path
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
    captured_kwargs: dict[str, object] = {}
    parser = SimpleNamespace(
        user_agent="test-agent",
        cookie="session=value",
        parse_video=lambda share_url: {
            "aweme_id": "123456",
            "desc": "标题",
            "author_nickname": "作者",
            "cover_url": "https://example.com/cover.jpg",
            "content_type": "video",
            "qualities": [
                {"url": "https://example.com/high.mp4", "bit_rate": 2000, "ratio": "1080p"},
                {"url": "https://example.com/low.mp4", "bit_rate": 300, "ratio": "480p"},
            ],
        }
    )
    extractor = SimpleNamespace(extract_from_url=lambda **kwargs: captured_kwargs.update(kwargs) or "/tmp/test.m4a")
    provider = DouyinProvider(parser=parser, extractor=extractor)

    result = await provider.resolve_audio(share_url="https://v.douyin.com/test")
    assert result.platform == "douyin"
    assert result.media_id == "123456"
    assert result.local_audio_path.endswith("/test.m4a")
    assert captured_kwargs["media_url"] == "https://example.com/low.mp4"
    assert captured_kwargs["request_headers"] == {
        "User-Agent": "test-agent",
        "Referer": "https://www.douyin.com/video/123456",
        "Origin": "https://www.douyin.com",
        "Accept": "*/*",
        "Cookie": "session=value",
    }


def test_pick_audio_source_url_prefers_lowest_bitrate_quality() -> None:
    """音频导入只关心声音，视频流应优先选择最低码率档位。"""
    selected = DouyinProvider._pick_audio_source_url(
        {
            "aweme_id": "123456",
            "nwm_url": "https://example.com/fallback.mp4",
            "qualities": [
                {"url": "https://example.com/high.mp4", "bit_rate": 1200, "ratio": "720p"},
                {"url": "https://example.com/medium.mp4", "bit_rate": 600, "ratio": "540p"},
                {"url": "https://example.com/low.mp4", "bit_rate": 280, "ratio": "480p"},
            ],
        }
    )
    assert selected == "https://example.com/low.mp4"


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


def test_extract_from_url_falls_back_to_local_download_after_403(tmp_path: Path) -> None:
    """远端直连被抖音拒绝时应先下载到本地再提取音频。"""
    extractor = FfmpegAudioExtractor(executable="ffmpeg")
    commands: list[list[str]] = []

    def fake_run(command, capture_output, text):
        commands.append(command)
        if len(commands) == 1:
            return SimpleNamespace(returncode=8, stderr="Server returned 403 Forbidden (access denied)", stdout="")
        Path(command[-1]).write_bytes(b"audio")
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    response = SimpleNamespace(
        headers={"content-type": "video/mp4"},
        iter_content=lambda chunk_size: [b"video-bytes"],
        raise_for_status=lambda: None,
        close=lambda: None,
    )

    with patch("services.external_media.ffmpeg_audio.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"):
        with patch("services.external_media.ffmpeg_audio.tempfile.mkdtemp", return_value=str(tmp_path)):
            with patch("services.external_media.ffmpeg_audio.subprocess.run", side_effect=fake_run):
                with patch("services.external_media.ffmpeg_audio.requests.get", return_value=response) as mocked_get:
                    output_path = extractor.extract_from_url(
                        media_url="https://example.com/video.mp4",
                        output_stem="demo",
                        request_headers={"Referer": "https://www.douyin.com/video/demo"},
                    )

    assert Path(output_path).exists()
    assert commands[0][commands[0].index("-i") + 1] == "https://example.com/video.mp4"
    assert commands[1][commands[1].index("-i") + 1].endswith("demo.source.mp4")
    mocked_get.assert_called_once_with(
        "https://example.com/video.mp4",
        headers={"Referer": "https://www.douyin.com/video/demo"},
        stream=True,
        timeout=30,
    )


def test_extract_from_url_does_not_forward_cookie_to_ffmpeg(tmp_path: Path) -> None:
    """ffmpeg 直连时不应携带超长 Cookie 头，避免直接触发 overlong headers。"""
    extractor = FfmpegAudioExtractor(executable="ffmpeg")
    commands: list[list[str]] = []

    def fake_run(command, capture_output, text):
        commands.append(command)
        Path(command[-1]).write_bytes(b"audio")
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    with patch("services.external_media.ffmpeg_audio.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"):
        with patch("services.external_media.ffmpeg_audio.tempfile.mkdtemp", return_value=str(tmp_path)):
            with patch("services.external_media.ffmpeg_audio.subprocess.run", side_effect=fake_run):
                output_path = extractor.extract_from_url(
                    media_url="https://example.com/video.mp4",
                    output_stem="demo",
                    request_headers={
                        "User-Agent": "test-agent",
                        "Referer": "https://www.douyin.com/video/demo",
                        "Cookie": "session=value",
                    },
                )

    assert Path(output_path).exists()
    headers_blob = commands[0][commands[0].index("-headers") + 1]
    assert "Referer: https://www.douyin.com/video/demo" in headers_blob
    assert "Cookie:" not in headers_blob


def test_request_json_logs_empty_body_diagnostics(capsys) -> None:
    """抖音详情接口返回空 body 时应输出更明确的诊断日志。"""
    parser = DouyinVideoParser()
    response = SimpleNamespace(
        status_code=200,
        content=b"",
        text="",
        headers={"content-type": "application/json"},
        json=lambda: {},
    )

    with patch("services.external_media.douyin.parser.requests.get", return_value=response):
        with patch("services.external_media.douyin.parser.XBogus", None):
            result = parser._request_json(
                "https://www.douyin.com/aweme/v1/web/aweme/detail/",
                {"aweme_id": "123"},
                {"Referer": "https://www.douyin.com/video/123"},
            )

    assert result is None
    captured = capsys.readouterr()
    assert "douyin_aweme_detail_empty_body" in captured.out
