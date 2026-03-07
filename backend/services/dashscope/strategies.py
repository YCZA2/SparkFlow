from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from services.base import TranscriptionResult

if TYPE_CHECKING:
    from services.dashscope_stt import DashScopeSTTService

logger = logging.getLogger(__name__)


class DashScopeTranscriptionStrategy(ABC):
    name: str
    supports_speaker_diarization: bool = False

    @abstractmethod
    async def transcribe(
        self,
        service: "DashScopeSTTService",
        *,
        audio_path: str,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        """Transcribe audio file with a specific strategy."""


class DashScopeRealtimeRecognitionStrategy(DashScopeTranscriptionStrategy):
    name = "realtime"
    supports_speaker_diarization = False

    async def transcribe(
        self,
        service: "DashScopeSTTService",
        *,
        audio_path: str,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        if service.diarization_enabled:
            logger.info("[DashScope STT] realtime strategy does not support diarization")

        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, service._recognize_file, audio_path, format_str, language),
            timeout=service.realtime_timeout_seconds,
        )


class DashScopeFileRecognitionStrategy(DashScopeTranscriptionStrategy):
    name = "file"
    supports_speaker_diarization = True

    async def transcribe(
        self,
        service: "DashScopeSTTService",
        *,
        audio_path: str,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, service._transcribe_recorded_file, audio_path, language),
            timeout=service.file_transcription_timeout_seconds,
        )


class DashScopeAutoRecognitionStrategy(DashScopeTranscriptionStrategy):
    name = "auto"
    supports_speaker_diarization = True

    def __init__(self) -> None:
        self.file_strategy = DashScopeFileRecognitionStrategy()
        self.realtime_strategy = DashScopeRealtimeRecognitionStrategy()

    async def transcribe(
        self,
        service: "DashScopeSTTService",
        *,
        audio_path: str,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        if service.diarization_enabled:
            try:
                logger.info("[DashScope STT] auto strategy prefers file transcription for diarization")
                return await self.file_strategy.transcribe(
                    service,
                    audio_path=audio_path,
                    format_str=format_str,
                    language=language,
                )
            except Exception as diarization_error:
                logger.warning("[DashScope STT] file strategy failed, fallback realtime: %s", str(diarization_error))

        return await self.realtime_strategy.transcribe(
            service,
            audio_path=audio_path,
            format_str=format_str,
            language=language,
        )
