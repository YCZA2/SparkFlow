"""DashScope STT 录音文件识别测试。"""

from __future__ import annotations

import os
import tempfile

import pytest

from services.base import SpeakerSegment, STTRecognitionError, TranscriptionResult
from services.dashscope_stt import DashScopeSTTService


class StubDashScopeSTTService(DashScopeSTTService):
    """通过覆写底层识别方法来测试文件识别调用。"""

    def __init__(
        self,
        *,
        diarization_enabled: bool,
        fail_transcription: bool = False,
    ) -> None:
        self.api_key = "test-key"
        self.model = self.DEFAULT_MODEL
        self.diarization_enabled = diarization_enabled
        self.speaker_count = 0
        self.file_url_mode = "temp"
        self.file_transcription_timeout_seconds = 5
        self.fail_transcription = fail_transcription
        self.calls: list[str] = []

    def _transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        """模拟文件识别成功或失败。"""
        self.calls.append("file")
        if self.fail_transcription:
            raise STTRecognitionError("file transcription failed")
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
async def test_file_transcription_keeps_speaker_segments(temp_audio_path: str) -> None:
    """录音文件识别应保留说话人分段。"""
    service = StubDashScopeSTTService(diarization_enabled=True)
    result = await service.transcribe(temp_audio_path)
    assert service.calls == ["file"]
    assert result.text == "文件转写"
    assert len(result.speaker_segments or []) == 1


@pytest.mark.asyncio
async def test_file_transcription_propagates_recognition_error(temp_audio_path: str) -> None:
    """录音文件识别失败时应抛出识别异常。"""
    service = StubDashScopeSTTService(diarization_enabled=False, fail_transcription=True)
    with pytest.raises(STTRecognitionError):
        await service.transcribe(temp_audio_path)
