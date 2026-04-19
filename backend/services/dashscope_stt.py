"""DashScope (阿里云百炼/灵积平台) STT 实现。"""

from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Optional

from core.config import settings
from core.logging_config import get_logger
from services.base import (
    AudioFormat,
    BaseSTTService,
    STTError,
    STTFileError,
    STTRecognitionError,
    TranscriptionResult,
)
from services.dashscope.bootstrap import CERTIFI_CA_FILE
from services.dashscope.file_transcription import DashScopeFileTranscriber
from services.dashscope.payload_parser import DashScopePayloadParser

logger = get_logger(__name__)


class DashScopeSTTService(BaseSTTService):
    """阿里云百炼/灵积平台语音识别服务。"""

    DEFAULT_MODEL = "paraformer-v2"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs,
    ):
        """初始化 DashScope STT 服务和策略集合。"""
        super().__init__(**kwargs)

        self.api_key = api_key or settings.DASHSCOPE_API_KEY
        self.model = model or self.DEFAULT_MODEL
        self.diarization_enabled = settings.STT_DIARIZATION_ENABLED
        self.speaker_count = max(0, int(settings.STT_DIARIZATION_SPEAKER_COUNT))
        self.file_url_mode = (settings.STT_FILE_URL_MODE or "temp").lower()
        self.file_transcription_timeout_seconds = max(1, int(settings.STT_FILE_TRANSCRIPTION_TIMEOUT_SECONDS))

        if not self.api_key:
            raise STTError(
                "缺少 DashScope API Key。请设置:\n"
                "  - DASHSCOPE_API_KEY (从 https://dashscope.console.aliyun.com/ 获取)"
            )

        import dashscope

        dashscope.api_key = self.api_key

        self._payload_parser = DashScopePayloadParser()
        self._file_transcriber = DashScopeFileTranscriber(
            api_key=self.api_key,
            file_transcription_model=self.model,
            diarization_enabled=self.diarization_enabled,
            speaker_count=self.speaker_count,
            file_url_mode=self.file_url_mode,
            certifi_ca_file=CERTIFI_CA_FILE,
            parser=self._payload_parser,
        )

        logger.info(
            "dashscope_stt_initialized",
            provider="dashscope",
            model=self.model,
            diarization=self.diarization_enabled,
            speaker_count=self.speaker_count,
            file_url_mode=self.file_url_mode,
        )

    async def transcribe(
        self,
        audio_path: str,
        audio_format: Optional[AudioFormat] = None,
        language_hint: Optional[str] = "zh-CN",
        **kwargs,
    ) -> TranscriptionResult:
        """执行单文件转写，并记录策略结果。"""
        if not os.path.exists(audio_path):
            raise STTFileError(f"音频文件不存在: {audio_path}")

        if audio_format is None:
            audio_format = self._detect_format(audio_path)

        format_mapping = {
            AudioFormat.M4A: "m4a",
            AudioFormat.MP3: "mp3",
            AudioFormat.WAV: "wav",
            AudioFormat.PCM: "pcm",
            AudioFormat.OGG: "ogg",
        }
        format_str = format_mapping.get(audio_format, "m4a")

        language_map = {
            "zh-CN": "zh",
            "en-US": "en",
            "ja-JP": "ja",
            "ko-KR": "ko",
            "yue": "yue",
        }
        language = language_map.get(language_hint, "zh")

        try:
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    self._file_transcriber.transcribe_recorded_file,
                    audio_path,
                    language,
                ),
                timeout=self.file_transcription_timeout_seconds,
            )
            logger.info("dashscope_stt_succeeded", provider="dashscope", model=self.model)
            return result
        except STTError:
            raise
        except asyncio.TimeoutError as exc:
            raise STTRecognitionError(f"录音文件识别超时: model={self.model}") from exc
        except Exception as exc:
            raise STTRecognitionError(f"语音识别失败: {str(exc)}") from exc

    async def transcribe_bytes(
        self,
        audio_data: bytes,
        audio_format: AudioFormat,
        language_hint: Optional[str] = "zh-CN",
        **kwargs,
    ) -> TranscriptionResult:
        """将字节音频写入临时文件后复用文件转写逻辑。"""
        if not audio_data:
            raise STTFileError("音频数据为空")

        format_mapping = {
            AudioFormat.M4A: "m4a",
            AudioFormat.MP3: "mp3",
            AudioFormat.WAV: "wav",
            AudioFormat.PCM: "pcm",
            AudioFormat.OGG: "ogg",
        }
        format_str = format_mapping.get(audio_format, "m4a")

        with tempfile.NamedTemporaryFile(suffix=f".{format_str}", delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name

        try:
            return await self.transcribe(temp_path, audio_format, language_hint, **kwargs)
        finally:
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    async def health_check(self) -> bool:
        """以 API Key 是否存在作为轻量健康检查。"""
        return bool(self.api_key)

    async def close(self):
        """保留统一关闭接口，当前无额外资源需要释放。"""
        pass


__all__ = [
    "DashScopeSTTService",
]
