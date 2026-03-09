"""DashScope STT 策略测试。"""

from __future__ import annotations

import os
import tempfile

import pytest

from services.base import SpeakerSegment, STTRecognitionError, TranscriptionResult
from services.dashscope_stt import (
    DashScopeAutoRecognitionStrategy,
    DashScopeFileRecognitionStrategy,
    DashScopeRealtimeRecognitionStrategy,
    DashScopeSTTService,
)


class StubDashScopeSTTService(DashScopeSTTService):
    """通过覆写底层识别方法来测试策略分发。"""

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
        """模拟实时识别成功。"""
        self.calls.append("realtime")
        return TranscriptionResult(text="实时转写", language=language, speaker_segments=None)

    def _transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        """模拟文件识别成功或失败。"""
        self.calls.append("file")
        if self.fail_file:
            raise STTRecognitionError("file strategy failed")
        return TranscriptionResult(
            text="文件转写",
            language=language,
            speaker_segments=[SpeakerSegment(speaker_id="spk-1", start_ms=0, end_ms=1000, text="你好")],
        )


@pytest.fixture
def temp_audio_path() -> str:
    """创建测试用音频临时文件。"""
    with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as temp_file:
        temp_file.write(b"fake-audio")
        temp_file.flush()
        audio_path = temp_file.name
    try:
        yield audio_path
    finally:
        os.unlink(audio_path)


@pytest.mark.asyncio
async def test_realtime_strategy_prefers_realtime_path(temp_audio_path: str) -> None:
    """实时策略应优先走实时识别路径。"""
    service = StubDashScopeSTTService(strategy_name="realtime", diarization_enabled=True)
    result = await service.transcribe(temp_audio_path)
    assert service.calls == ["realtime"]
    assert result.text == "实时转写"
    assert result.speaker_segments is None


@pytest.mark.asyncio
async def test_file_strategy_keeps_speaker_segments(temp_audio_path: str) -> None:
    """文件策略应保留说话人分段。"""
    service = StubDashScopeSTTService(strategy_name="file", diarization_enabled=True)
    result = await service.transcribe(temp_audio_path)
    assert service.calls == ["file"]
    assert result.text == "文件转写"
    assert len(result.speaker_segments or []) == 1


@pytest.mark.asyncio
async def test_auto_strategy_falls_back_to_realtime_when_file_strategy_fails(temp_audio_path: str) -> None:
    """自动策略在文件识别失败时应回退实时识别。"""
    service = StubDashScopeSTTService(strategy_name="auto", diarization_enabled=True, fail_file=True)
    result = await service.transcribe(temp_audio_path)
    assert service.calls == ["file", "realtime"]
    assert result.text == "实时转写"
    assert result.speaker_segments is None


@pytest.mark.asyncio
async def test_invalid_strategy_raises_recognition_error(temp_audio_path: str) -> None:
    """非法策略名称应抛出识别异常。"""
    service = StubDashScopeSTTService(strategy_name="invalid", diarization_enabled=False)
    with pytest.raises(STTRecognitionError):
        await service.transcribe(temp_audio_path)
