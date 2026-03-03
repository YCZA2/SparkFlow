"""
Aliyun NLS (Neural Language Service) STT Implementation.

Uses Alibaba Cloud's NLS SDK for speech recognition.
Supports real-time and file-based transcription.
"""

import os
import asyncio
from typing import Optional

from .base import (
    BaseSTTService,
    TranscriptionResult,
    AudioFormat,
    STTError,
    STTFileError,
    STTRecognitionError,
    STTRateLimitError,
)


class AliyunSTTService(BaseSTTService):
    """
    Speech-to-Text service using Alibaba Cloud NLS.

    Supports formats: m4a, mp3, wav, pcm
    Optimized for Chinese speech recognition.
    """

    # Default language
    DEFAULT_LANGUAGE = "zh-CN"

    def __init__(
        self,
        access_key_id: Optional[str] = None,
        access_key_secret: Optional[str] = None,
        app_key: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize the Aliyun STT service.

        Args:
            access_key_id: Alibaba Cloud Access Key ID
            access_key_secret: Alibaba Cloud Access Key Secret
            app_key: NLS App Key
            **kwargs: Additional configuration
        """
        super().__init__(**kwargs)

        self.access_key_id = access_key_id or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID")
        self.access_key_secret = access_key_secret or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
        self.app_key = app_key or os.getenv("ALIBABA_CLOUD_APP_KEY")

        if not all([self.access_key_id, self.access_key_secret, self.app_key]):
            raise STTError(
                "Missing required credentials. Please set:\n"
                "  - ALIBABA_CLOUD_ACCESS_KEY_ID\n"
                "  - ALIBABA_CLOUD_ACCESS_KEY_SECRET\n"
                "  - ALIBABA_CLOUD_APP_KEY"
            )

        # Import NLS SDK
        try:
            import nls
            self.nls = nls
        except ImportError:
            raise STTError(
                "alibabacloud-nls package not installed. "
                "Run: pip install alibabacloud-nls"
            )

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
            audio_format: Format of the audio (auto-detected if None)
            language_hint: Expected language (zh-CN or en-US)
            **kwargs: Additional parameters

        Returns:
            TranscriptionResult with transcribed text
        """
        # Check file exists
        if not os.path.exists(audio_path):
            raise STTFileError(f"Audio file not found: {audio_path}")

        # Detect format if not provided
        if audio_format is None:
            audio_format = self._detect_format(audio_path)

        # Read audio file
        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()
        except Exception as e:
            raise STTFileError(f"Failed to read audio file: {str(e)}")

        # Use transcribe_bytes
        return await self.transcribe_bytes(
            audio_data=audio_data,
            audio_format=audio_format,
            language_hint=language_hint,
            **kwargs
        )

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
            audio_format: Format of the audio
            language_hint: Expected language
            **kwargs: Additional parameters

        Returns:
            TranscriptionResult with transcribed text
        """
        if not audio_data:
            raise STTFileError("Audio data is empty")

        # Map format to sample rate and encoding
        format_mapping = {
            AudioFormat.M4A: (16000, "m4a"),
            AudioFormat.MP3: (16000, "mp3"),
            AudioFormat.WAV: (16000, "wav"),
            AudioFormat.PCM: (16000, "pcm"),
            AudioFormat.OGG: (16000, "ogg"),
        }

        sample_rate, encoding = format_mapping.get(audio_format, (16000, "m4a"))

        # Use asyncio to run the blocking NLS SDK in a thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,  # Use default executor
            self._sync_transcribe,
            audio_data,
            sample_rate,
            encoding,
            language_hint,
            kwargs
        )

    def _sync_transcribe(
        self,
        audio_data: bytes,
        sample_rate: int,
        encoding: str,
        language_hint: str,
        kwargs: dict
    ) -> TranscriptionResult:
        """
        Synchronous transcription using NLS SDK.

        This runs in a thread pool to avoid blocking the event loop.
        """
        result_text = []
        confidence = None
        duration_ms = None
        error_occurred = None

        def on_result(message, result):
            """Callback for recognition results."""
            if result and "payload" in result:
                payload = result["payload"]
                if "result" in payload:
                    result_text.append(payload["result"])
                if "confidence" in payload:
                    nonlocal confidence
                    confidence = payload["confidence"]
                if "duration" in payload:
                    nonlocal duration_ms
                    duration_ms = payload["duration"]

        def on_error(message):
            """Callback for errors."""
            nonlocal error_occurred
            error_occurred = message

        def on_close():
            """Callback for connection close."""
            pass

        try:
            # Create recognition instance
            recognition = self.nls.NlsSpeechTranscriber(
                akid=self.access_key_id,
                aksecret=self.access_key_secret,
                appkey=self.app_key,
                token=None,  # SDK will auto-generate token
                on_result=on_result,
                on_error=on_error,
                on_close=on_close,
            )

            # Start recognition
            recognition.start(
                aformat=encoding,
                sample_rate=sample_rate,
                enable_punctuation_prediction=True,
                enable_inverse_text_normalization=True,
                enable_intermediate_result=False,
            )

            # Send audio data
            recognition.send_audio(audio_data)

            # Stop recognition
            recognition.stop()

            # Check for errors
            if error_occurred:
                raise STTRecognitionError(f"Recognition error: {error_occurred}")

            # Combine results
            final_text = "".join(result_text)
            if not final_text:
                final_text = ""  # Empty transcription is OK

            return TranscriptionResult(
                text=final_text,
                confidence=confidence,
                duration_ms=duration_ms,
                language=language_hint
            )

        except (STTError,):
            raise
        except Exception as e:
            raise STTRecognitionError(f"Transcription failed: {str(e)}")

    async def health_check(self) -> bool:
        """
        Check if the STT service is healthy.

        Returns:
            True if healthy
        """
        try:
            # Simple health check - verify credentials are valid
            # by checking token generation
            if hasattr(self.nls, 'NlsToken'):
                token = self.nls.NlsToken()
                token.setAccessKeyId(self.access_key_id)
                token.setAccessKeySecret(self.access_key_secret)
                token.apply()
                return True
            return True  # If we got here, SDK is available
        except Exception:
            return False
