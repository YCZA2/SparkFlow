from __future__ import annotations

import logging
import os
import tempfile
import time
from typing import Optional

from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

from constants.audio import (
    AUDIO_SAMPLE_RATE,
    BYTES_PER_SECOND,
    CHUNK_SIZE_BYTES,
    MIN_RECOGNITION_WAIT_SECONDS,
    RECOGNITION_POLL_INTERVAL_SECONDS,
    RECOGNITION_TIMEOUT_BUFFER_SECONDS,
    WAV_HEADER_SIZE,
)
from services.base import STTError, STTFileError, STTRecognitionError, TranscriptionResult

logger = logging.getLogger(__name__)


class SimpleRecognitionCallback(RecognitionCallback):
    """Simple callback for collecting final streaming ASR sentences."""

    def __init__(self):
        self.sentences: list[str] = []
        self.error = None
        self.completed = False

    def on_open(self) -> None:
        logger.debug("[DashScope STT] websocket opened")

    def on_complete(self) -> None:
        logger.debug("[DashScope STT] recognition completed")
        self.completed = True

    def on_error(self, result: RecognitionResult) -> None:
        logger.error("[DashScope STT] recognition error: %s", result)
        self.error = result

    def on_close(self) -> None:
        logger.debug("[DashScope STT] websocket closed")

    def on_event(self, result: RecognitionResult) -> None:
        try:
            sentence = result.get_sentence()
            if sentence and sentence.get("sentence_end"):
                text = sentence.get("text", "")
                self.sentences.append(text)
                logger.debug("[DashScope STT] final sentence: %s", text)
        except Exception as exc:
            logger.warning("[DashScope STT] parse event failed: %s", exc)


class DashScopeRealtimeRecognizer:
    def __init__(self, *, model: str) -> None:
        self.model = model

    @staticmethod
    def _convert_to_wav(audio_path: str) -> str:
        if audio_path.lower().endswith(".wav"):
            return audio_path

        try:
            from pydub import AudioSegment

            audio = AudioSegment.from_file(audio_path)
            audio = audio.set_channels(1).set_frame_rate(AUDIO_SAMPLE_RATE).set_sample_width(2)
            temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_wav_path = temp_wav.name
            temp_wav.close()
            audio.export(temp_wav_path, format="wav")
            logger.info("[DashScope STT] converted audio to wav: %s", temp_wav_path)
            return temp_wav_path
        except ImportError:
            logger.warning("[DashScope STT] pydub not installed, use original audio")
            return audio_path
        except Exception as exc:
            logger.warning("[DashScope STT] audio conversion failed, use original file: %s", exc)
            return audio_path

    def _convert_audio_if_needed(self, audio_path: str, format_str: str) -> tuple[str, str, Optional[str]]:
        try:
            audio_path_to_use = self._convert_to_wav(audio_path)
            if audio_path_to_use != audio_path:
                return audio_path_to_use, "wav", audio_path_to_use
            return audio_path_to_use, format_str, None
        except Exception as exc:
            logger.warning("[DashScope STT] conversion failed, keep original file: %s", exc)
            return audio_path, format_str, None

    @staticmethod
    def _read_audio_data(audio_path: str, format_str: str) -> bytes:
        with open(audio_path, "rb") as audio_file:
            header = audio_file.read(WAV_HEADER_SIZE)
            if len(header) < WAV_HEADER_SIZE:
                raise STTFileError(f"audio file too small: {audio_path}")

            if format_str == "wav" and header[:4] != b"RIFF":
                logger.warning("[DashScope STT] invalid WAV header, read full file")
                audio_file.seek(0)

            return audio_file.read()

    @staticmethod
    def _stream_recognize(recognition: Recognition, audio_data: bytes) -> None:
        for offset in range(0, len(audio_data), CHUNK_SIZE_BYTES):
            recognition.send_audio_frame(audio_data[offset:offset + CHUNK_SIZE_BYTES])

    @staticmethod
    def _wait_for_result(callback: SimpleRecognitionCallback, audio_data_size: int) -> None:
        audio_duration = audio_data_size / BYTES_PER_SECOND
        max_wait = max(
            MIN_RECOGNITION_WAIT_SECONDS,
            audio_duration + RECOGNITION_TIMEOUT_BUFFER_SECONDS,
        )

        wait_time = 0.0
        while not callback.completed and not callback.error and wait_time < max_wait:
            time.sleep(RECOGNITION_POLL_INTERVAL_SECONDS)
            wait_time += RECOGNITION_POLL_INTERVAL_SECONDS

        if not callback.completed and not callback.error:
            logger.warning("[DashScope STT] recognition timeout (%.1fs)", wait_time)

        if callback.error:
            error_msg = callback.error.message if hasattr(callback.error, "message") else "unknown error"
            logger.error("[DashScope STT] recognition failed: %s", error_msg)
            raise STTRecognitionError(f"recognition failed: {error_msg}")

    def recognize_file(self, audio_path: str, format_str: str, language: str) -> TranscriptionResult:
        logger.info("[DashScope STT] sdk call: model=%s format=%s", self.model, format_str)

        audio_path_to_use, format_to_use, temp_wav_path = self._convert_audio_if_needed(audio_path, format_str)

        try:
            callback = SimpleRecognitionCallback()
            recognition = Recognition(
                model=self.model,
                callback=callback,
                format=format_to_use,
                sample_rate=AUDIO_SAMPLE_RATE,
            )

            recognition.start()
            audio_data = self._read_audio_data(audio_path_to_use, format_to_use)
            self._stream_recognize(recognition, audio_data)
            recognition.stop()
            self._wait_for_result(callback, len(audio_data))

            return TranscriptionResult(
                text="".join(callback.sentences),
                confidence=None,
                duration_ms=None,
                language=language,
            )
        except STTError:
            raise
        except Exception as exc:
            logger.error("[DashScope STT] SDK exception: %s: %s", type(exc).__name__, str(exc))
            raise STTRecognitionError(f"recognition exception: {str(exc)}")
        finally:
            if temp_wav_path and os.path.exists(temp_wav_path):
                try:
                    os.unlink(temp_wav_path)
                except Exception as exc:
                    logger.warning("[DashScope STT] failed to cleanup temp file: %s", exc)
