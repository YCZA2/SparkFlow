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
from services.dashscope.audio_stream import DashScopeRealtimeRecognizer
from services.dashscope.file_transcription import DashScopeFileTranscriber
from services.dashscope.payload_parser import DashScopePayloadParser
from services.dashscope.strategies import (
    DashScopeAutoRecognitionStrategy,
    DashScopeFileRecognitionStrategy,
    DashScopeRealtimeRecognitionStrategy,
    DashScopeTranscriptionStrategy,
)

logger = get_logger(__name__)


class DashScopeSTTService(BaseSTTService):
    """阿里云百炼/灵积平台语音识别服务。"""

    DEFAULT_MODEL = "paraformer-realtime-v2"
    FILE_TRANSCRIPTION_MODEL = "paraformer-v2"

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
        self.strategy_name = (settings.STT_DASHSCOPE_STRATEGY or "realtime").lower()
        self.realtime_timeout_seconds = max(1, int(settings.STT_REALTIME_TIMEOUT_SECONDS))
        self.file_transcription_timeout_seconds = max(1, int(settings.STT_FILE_TRANSCRIPTION_TIMEOUT_SECONDS))

        if not self.api_key:
            raise STTError(
                "缺少 DashScope API Key。请设置:\n"
                "  - DASHSCOPE_API_KEY (从 https://dashscope.console.aliyun.com/ 获取)"
            )

        import dashscope

        dashscope.api_key = self.api_key

        self._payload_parser = DashScopePayloadParser()
        self._realtime_recognizer = DashScopeRealtimeRecognizer(model=self.model)
        self._file_transcriber = DashScopeFileTranscriber(
            api_key=self.api_key,
            file_transcription_model=self.FILE_TRANSCRIPTION_MODEL,
            diarization_enabled=self.diarization_enabled,
            speaker_count=self.speaker_count,
            file_url_mode=self.file_url_mode,
            certifi_ca_file=CERTIFI_CA_FILE,
            parser=self._payload_parser,
        )
        self._strategies: dict[str, DashScopeTranscriptionStrategy] = {
            "realtime": DashScopeRealtimeRecognitionStrategy(),
            "file": DashScopeFileRecognitionStrategy(),
            "auto": DashScopeAutoRecognitionStrategy(),
        }

        logger.info(
            "dashscope_stt_initialized",
            provider="dashscope",
            strategy=self.strategy_name,
            diarization=self.diarization_enabled,
            speaker_count=self.speaker_count,
            file_url_mode=self.file_url_mode,
        )

    def _get_strategy(self) -> DashScopeTranscriptionStrategy:
        """获取当前配置对应的识别策略。"""
        strategy = self._strategies.get(self.strategy_name)
        if strategy is None:
            supported = ", ".join(sorted(self._strategies))
            raise STTRecognitionError(f"不支持的 DashScope STT 策略: {self.strategy_name}，支持: {supported}")
        return strategy

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
            strategy = self._get_strategy()
            result = await strategy.transcribe(
                self,
                audio_path=audio_path,
                format_str=format_str,
                language=language,
            )
            logger.info("dashscope_stt_succeeded", provider="dashscope", strategy=strategy.name)
            return result
        except STTError:
            raise
        except asyncio.TimeoutError as exc:
            raise STTRecognitionError(f"语音识别超时: strategy={self.strategy_name}") from exc
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

    # Compatibility methods retained for existing strategy tests.
    def _recognize_file(self, audio_path: str, format_str: str, language: str) -> TranscriptionResult:
        """兼容旧策略测试的实时识别入口。"""
        return self._realtime_recognizer.recognize_file(audio_path=audio_path, format_str=format_str, language=language)

    def _transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        """兼容旧策略测试的录音文件识别入口。"""
        return self._file_transcriber.transcribe_recorded_file(audio_path=audio_path, language=language)

    async def health_check(self) -> bool:
        """以 API Key 是否存在作为轻量健康检查。"""
        return bool(self.api_key)

    async def close(self):
        """保留统一关闭接口，当前无额外资源需要释放。"""
        pass


__all__ = [
    "DashScopeAutoRecognitionStrategy",
    "DashScopeFileRecognitionStrategy",
    "DashScopeRealtimeRecognitionStrategy",
    "DashScopeSTTService",
]
