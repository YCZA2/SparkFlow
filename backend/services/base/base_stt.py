"""
STT (语音识别) 服务的抽象基类

本模块定义了语音识别服务的接口，允许在不同提供商之间轻松切换
(阿里云、讯飞、百度等)
"""

from abc import ABC, abstractmethod
from typing import Optional
from dataclasses import dataclass
from enum import Enum


class AudioFormat(Enum):
    """支持的音频格式"""
    M4A = "m4a"
    MP3 = "mp3"
    WAV = "wav"
    PCM = "pcm"
    OGG = "ogg"


@dataclass
class SpeakerSegment:
    """说话人分段结果。"""

    speaker_id: str
    start_ms: int
    end_ms: int
    text: str


@dataclass
class TranscriptionResult:
    """转写操作的结果"""

    text: str
    confidence: Optional[float] = None
    duration_ms: Optional[int] = None
    language: Optional[str] = None
    speaker_segments: Optional[list[SpeakerSegment]] = None


class BaseSTTService(ABC):
    """
    STT 服务实现的抽象基类

    所有语音识别提供商都应实现此接口，以确保
    在不同后端之间保持一致的行为
    """

    def __init__(self, **kwargs):
        """
        初始化 STT 服务

        Args:
            **kwargs: 提供商特定的配置 (API 密钥、端点等)
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
        将音频文件转写为文本

        Args:
            audio_path: 音频文件路径
            audio_format: 音频文件格式 (为 None 时自动检测)
            language_hint: 预期语言代码 (如 'zh-CN', 'en-US')
            **kwargs: 额外的提供商特定参数

        Returns:
            TranscriptionResult 包含转写文本和元数据

        Raises:
            STTError: 转写失败时抛出
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
        将音频字节数据转写为文本

        Args:
            audio_data: 原始音频数据字节
            audio_format: 音频数据格式
            language_hint: 预期语言代码
            **kwargs: 额外的提供商特定参数

        Returns:
            TranscriptionResult 包含转写文本和元数据

        Raises:
            STTError: 转写失败时抛出
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查 STT 服务是否健康且可访问

        Returns:
            如果服务健康返回 True，否则返回 False
        """
        pass

    def _detect_format(self, audio_path: str) -> AudioFormat:
        """
        从文件扩展名检测音频格式

        Args:
            audio_path: 音频文件路径

        Returns:
            检测到的 AudioFormat
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
    """STT 服务错误的基类异常"""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "STT_ERROR"
        self.details = details or {}


class STTFileError(STTError):
    """音频文件无效或无法读取时抛出"""

    def __init__(self, message: str = "无效的音频文件"):
        super().__init__(message, code="FILE_ERROR")


class STTRecognitionError(STTError):
    """语音识别失败时抛出"""

    def __init__(self, message: str = "识别失败"):
        super().__init__(message, code="RECOGNITION_ERROR")


class STTRateLimitError(STTError):
    """超出速率限制时抛出"""

    def __init__(self, message: str = "超出速率限制"):
        super().__init__(message, code="RATE_LIMIT_ERROR")
