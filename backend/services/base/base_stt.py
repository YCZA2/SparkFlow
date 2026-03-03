"""
Abstract base class for STT (Speech-to-Text) services.

This module defines the interface for speech recognition services,
allowing easy switching between different providers (Aliyun, Xunfei, Baidu, etc.)
"""

from abc import ABC, abstractmethod
from typing import Optional
from dataclasses import dataclass
from enum import Enum


class AudioFormat(Enum):
    """Supported audio formats."""
    M4A = "m4a"
    MP3 = "mp3"
    WAV = "wav"
    PCM = "pcm"
    OGG = "ogg"


@dataclass
class TranscriptionResult:
    """Result of a transcription operation."""

    text: str
    confidence: Optional[float] = None
    duration_ms: Optional[int] = None
    language: Optional[str] = None


class BaseSTTService(ABC):
    """
    Abstract base class for STT service implementations.

    All speech-to-text providers should implement this interface
    to ensure consistent behavior across different backends.
    """

    def __init__(self, **kwargs):
        """
        Initialize the STT service.

        Args:
            **kwargs: Provider-specific configuration (API keys, endpoints, etc.)
        """
        self.config = kwargs

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        audio_format: Optional[AudioFormat] = None,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio file to text.

        Args:
            audio_path: Path to the audio file
            audio_format: Format of the audio file (auto-detected if None)
            language_hint: Expected language code (e.g., 'zh-CN', 'en-US')
            **kwargs: Additional provider-specific parameters

        Returns:
            TranscriptionResult containing the transcribed text and metadata

        Raises:
            STTError: If transcription fails
        """
        pass

    @abstractmethod
    async def transcribe_bytes(
        self,
        audio_data: bytes,
        audio_format: AudioFormat,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio bytes to text.

        Args:
            audio_data: Raw audio data bytes
            audio_format: Format of the audio data
            language_hint: Expected language code
            **kwargs: Additional provider-specific parameters

        Returns:
            TranscriptionResult containing the transcribed text and metadata

        Raises:
            STTError: If transcription fails
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the STT service is healthy and accessible.

        Returns:
            True if the service is healthy, False otherwise
        """
        pass

    def _detect_format(self, audio_path: str) -> AudioFormat:
        """
        Detect audio format from file extension.

        Args:
            audio_path: Path to the audio file

        Returns:
            Detected AudioFormat
        """
        ext = audio_path.lower().split(".")[-1] if "." in audio_path else ""
        format_map = {
            "m4a": AudioFormat.M4A,
            "mp3": AudioFormat.MP3,
            "wav": AudioFormat.WAV,
            "pcm": AudioFormat.PCM,
            "ogg": AudioFormat.OGG,
        }
        return format_map.get(ext, AudioFormat.M4A)


class STTError(Exception):
    """Base exception for STT service errors."""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "STT_ERROR"
        self.details = details or {}


class STTFileError(STTError):
    """Raised when audio file is invalid or cannot be read."""

    def __init__(self, message: str = "Invalid audio file"):
        super().__init__(message, code="FILE_ERROR")


class STTRecognitionError(STTError):
    """Raised when speech recognition fails."""

    def __init__(self, message: str = "Recognition failed"):
        super().__init__(message, code="RECOGNITION_ERROR")


class STTRateLimitError(STTError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, code="RATE_LIMIT_ERROR")
