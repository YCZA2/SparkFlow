import unittest
from types import SimpleNamespace
from unittest.mock import patch

from core.exceptions import AppException, ValidationError
from services.external_media.douyin.provider import DouyinProvider
from services.external_media.ffmpeg_audio import FfmpegAudioExtractor
from services.external_media.service import ExternalMediaService


class ExternalMediaServiceTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_audio_rejects_unknown_platform(self) -> None:
        service = ExternalMediaService(douyin_provider=SimpleNamespace(resolve_audio=None))
        with self.assertRaises(ValidationError):
            await service.resolve_audio(share_url="https://v.douyin.com/test", platform="kuaishou")

    async def test_resolve_audio_rejects_non_douyin_url_in_auto_mode(self) -> None:
        service = ExternalMediaService(douyin_provider=SimpleNamespace(resolve_audio=None))
        with self.assertRaises(ValidationError):
            await service.resolve_audio(share_url="https://example.com/video", platform="auto")


class DouyinProviderTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_audio_maps_metadata_and_extracts_audio(self) -> None:
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
        self.assertEqual(result.platform, "douyin")
        self.assertEqual(result.media_id, "123456")
        self.assertTrue(result.local_audio_path.endswith("/test.m4a"))

    async def test_resolve_audio_rejects_non_video_content(self) -> None:
        parser = SimpleNamespace(parse_video=lambda share_url: {"content_type": "image"})
        provider = DouyinProvider(parser=parser, extractor=SimpleNamespace())
        with self.assertRaises(ValidationError):
            await provider.resolve_audio(share_url="https://v.douyin.com/test")


class FfmpegAudioExtractorTestCase(unittest.TestCase):
    def test_extract_from_url_reports_missing_ffmpeg(self) -> None:
        extractor = FfmpegAudioExtractor(executable="ffmpeg")
        with patch("services.external_media.ffmpeg_audio.shutil.which", return_value=None):
            with self.assertRaises(AppException) as ctx:
                extractor.extract_from_url(media_url="https://example.com/video.mp4", output_stem="demo")
        self.assertEqual(ctx.exception.code, "EXTERNAL_MEDIA_IMPORT_FAILED")

    def test_extract_from_url_reports_subprocess_failure(self) -> None:
        extractor = FfmpegAudioExtractor(executable="ffmpeg")
        with patch("services.external_media.ffmpeg_audio.shutil.which", return_value="/opt/homebrew/bin/ffmpeg"):
            with patch(
                "services.external_media.ffmpeg_audio.subprocess.run",
                return_value=SimpleNamespace(returncode=1, stderr="boom", stdout=""),
            ):
                with self.assertRaises(AppException) as ctx:
                    extractor.extract_from_url(media_url="https://example.com/video.mp4", output_stem="demo")
        self.assertEqual(ctx.exception.code, "EXTERNAL_MEDIA_IMPORT_FAILED")
