import tempfile
import unittest
import os

from services.base import SpeakerSegment, STTRecognitionError, TranscriptionResult
from services.dashscope_stt import (
    DashScopeAutoRecognitionStrategy,
    DashScopeFileRecognitionStrategy,
    DashScopeRealtimeRecognitionStrategy,
    DashScopeSTTService,
)


class StubDashScopeSTTService(DashScopeSTTService):
    def __init__(
        self,
        *,
        strategy_name: str,
        diarization_enabled: bool,
        fail_file: bool = False,
    ) -> None:
        self.api_key = "test-key"
        self.model = self.DEFAULT_MODEL
        self.diarization_enabled = diarization_enabled
        self.speaker_count = 0
        self.file_url_mode = "temp"
        self.strategy_name = strategy_name
        self.realtime_timeout_seconds = 5
        self.file_transcription_timeout_seconds = 5
        self.fail_file = fail_file
        self.calls: list[str] = []
        self._strategies = {
            "realtime": DashScopeRealtimeRecognitionStrategy(),
            "file": DashScopeFileRecognitionStrategy(),
            "auto": DashScopeAutoRecognitionStrategy(),
        }

    def _recognize_file(self, audio_path: str, format_str: str, language: str) -> TranscriptionResult:
        self.calls.append("realtime")
        return TranscriptionResult(text="实时转写", language=language, speaker_segments=None)

    def _transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        self.calls.append("file")
        if self.fail_file:
            raise STTRecognitionError("file strategy failed")
        return TranscriptionResult(
            text="文件转写",
            language=language,
            speaker_segments=[SpeakerSegment(speaker_id="spk-1", start_ms=0, end_ms=1000, text="你好")],
        )


class DashScopeSTTStrategyTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".m4a", delete=False)
        self.temp_file.write(b"fake-audio")
        self.temp_file.flush()
        self.audio_path = self.temp_file.name

    async def asyncTearDown(self) -> None:
        self.temp_file.close()
        os.unlink(self.audio_path)

    async def test_realtime_strategy_prefers_realtime_path(self) -> None:
        service = StubDashScopeSTTService(strategy_name="realtime", diarization_enabled=True)

        result = await service.transcribe(self.audio_path)

        self.assertEqual(service.calls, ["realtime"])
        self.assertEqual(result.text, "实时转写")
        self.assertIsNone(result.speaker_segments)

    async def test_file_strategy_keeps_speaker_segments(self) -> None:
        service = StubDashScopeSTTService(strategy_name="file", diarization_enabled=True)

        result = await service.transcribe(self.audio_path)

        self.assertEqual(service.calls, ["file"])
        self.assertEqual(result.text, "文件转写")
        self.assertEqual(len(result.speaker_segments or []), 1)

    async def test_auto_strategy_falls_back_to_realtime_when_file_strategy_fails(self) -> None:
        service = StubDashScopeSTTService(strategy_name="auto", diarization_enabled=True, fail_file=True)

        result = await service.transcribe(self.audio_path)

        self.assertEqual(service.calls, ["file", "realtime"])
        self.assertEqual(result.text, "实时转写")
        self.assertIsNone(result.speaker_segments)

    async def test_invalid_strategy_raises_recognition_error(self) -> None:
        service = StubDashScopeSTTService(strategy_name="invalid", diarization_enabled=False)

        with self.assertRaises(STTRecognitionError):
            await service.transcribe(self.audio_path)
