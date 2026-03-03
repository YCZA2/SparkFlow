"""
DashScope (阿里云百炼/灵积平台) STT Implementation.

使用阿里云 dashscope SDK 进行语音识别，支持 paraformer 系列模型。
比 NLS 更简洁，仅需一个 API Key 即可使用。
"""

import os
import asyncio
from typing import Optional

import httpx

from .base import (
    BaseSTTService,
    TranscriptionResult,
    AudioFormat,
    STTError,
    STTFileError,
    STTRecognitionError,
)


class DashScopeSTTService(BaseSTTService):
    """
    阿里云百炼/灵积平台语音识别服务。

    支持模型:
    - paraformer-v2: 非流式语音识别，适合完整音频文件
    - paraformer-realtime-v2: 流式语音识别
    - paraformer-mtl-v1: 多语言模型

    仅需 DASHSCOPE_API_KEY 即可使用，无需 AccessKey/AppKey 组合。
    """

    # 默认模型
    DEFAULT_MODEL = "paraformer-v2"

    # DashScope API 端点
    API_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ):
        """
        初始化百炼 STT 服务。

        Args:
            api_key: DashScope API Key (sk-...)
            model: 模型名称，默认 paraformer-v2
            **kwargs: 其他配置
        """
        super().__init__(**kwargs)

        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")
        self.model = model or self.DEFAULT_MODEL

        if not self.api_key:
            raise STTError(
                "缺少 DashScope API Key。请设置:\n"
                "  - DASHSCOPE_API_KEY (从 https://dashscope.console.aliyun.com/ 获取)"
            )

        # 初始化 HTTP 客户端
        self.client = httpx.AsyncClient(
            base_url="https://dashscope.aliyuncs.com",
            timeout=60.0,
        )

    async def transcribe(
        self,
        audio_path: str,
        audio_format: Optional[AudioFormat] = None,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        转写音频文件为文本。

        Args:
            audio_path: 音频文件路径
            audio_format: 音频格式 (None 则自动检测)
            language_hint: 语言提示 (zh-CN, en-US, 等)
            **kwargs: 额外参数

        Returns:
            TranscriptionResult 包含转写结果
        """
        # 检查文件存在
        if not os.path.exists(audio_path):
            raise STTFileError(f"音频文件不存在: {audio_path}")

        # 检测格式
        if audio_format is None:
            audio_format = self._detect_format(audio_path)

        # 读取音频文件
        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()
        except Exception as e:
            raise STTFileError(f"读取音频文件失败: {str(e)}")

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
        转写音频数据为文本。

        Args:
            audio_data: 音频二进制数据
            audio_format: 音频格式
            language_hint: 语言提示
            **kwargs: 额外参数

        Returns:
            TranscriptionResult 包含转写结果
        """
        if not audio_data:
            raise STTFileError("音频数据为空")

        # 映射格式到 dashscope 格式
        format_mapping = {
            AudioFormat.M4A: "m4a",
            AudioFormat.MP3: "mp3",
            AudioFormat.WAV: "wav",
            AudioFormat.PCM: "pcm",
            AudioFormat.OGG: "ogg",
        }
        format_str = format_mapping.get(audio_format, "m4a")

        # 构建请求
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

        # 使用 multipart/form-data 上传
        # 参考文档: https://help.aliyun.com/zh/dashscope/developer-reference/paraformer-api
        files = {
            "file": (f"audio.{format_str}", audio_data, f"audio/{format_str}"),
        }

        # 构建参数
        # 支持的语言参数映射
        language_map = {
            "zh-CN": "zh",
            "en-US": "en",
            "ja-JP": "ja",
            "ko-KR": "ko",
            "yue": "yue",  # 粤语
        }
        language = language_map.get(language_hint, "zh")

        # 使用 paraformer 模型的 transcription API
        # 新版本的 dashscope 可以通过 SDK 或 HTTP API 调用
        try:
            # 使用 transcription API (异步任务方式，适合长音频)
            # 或者使用同步识别 API
            result = await self._transcribe_sync(
                audio_data=audio_data,
                format_str=format_str,
                language=language,
            )
            return result

        except STTError:
            raise
        except Exception as e:
            raise STTRecognitionError(f"语音识别失败: {str(e)}")

    async def _transcribe_sync(
        self,
        audio_data: bytes,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        """
        同步识别接口调用。

        使用 dashscope 的语音识别 API，支持直接上传音频数据。
        """
        # 使用 recognition API (同步识别，适合短音频 < 60秒)
        url = "/api/v1/services/audio/asr/recognition"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/octet-stream",
            "X-DashScope-Model": self.model,
            "X-DashScope-DataFormat": format_str,
            "X-DashScope-Language": language,
        }

        try:
            response = await self.client.post(
                url,
                headers=headers,
                content=audio_data,
            )
            response.raise_for_status()

            data = response.json()

            # 解析响应
            # 响应格式参考:
            # {
            #   "output": {
            #     "text": "识别结果文本"
            #   },
            #   "usage": { ... }
            # }
            if "output" in data and "text" in data["output"]:
                text = data["output"]["text"]
                return TranscriptionResult(
                    text=text,
                    confidence=None,  # paraformer 可能不返回置信度
                    duration_ms=None,
                    language=language,
                )
            else:
                # 检查是否有错误
                if "error" in data:
                    error_msg = data["error"].get("message", "未知错误")
                    raise STTRecognitionError(f"API 返回错误: {error_msg}")
                raise STTRecognitionError(f"无法解析 API 响应: {data}")

        except httpx.HTTPStatusError as e:
            raise STTRecognitionError(f"API 请求失败: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            if isinstance(e, STTError):
                raise
            raise STTRecognitionError(f"请求异常: {str(e)}")

    async def health_check(self) -> bool:
        """
        检查服务健康状态。

        Returns:
            True 如果服务可用
        """
        try:
            # 发送一个空请求或简单的模型查询来验证 API Key 有效性
            headers = {
                "Authorization": f"Bearer {self.api_key}",
            }
            response = await self.client.get(
                "/api/v1/models",
                headers=headers,
                timeout=5.0,
            )
            return response.status_code == 200
        except Exception:
            return False

    async def close(self):
        """关闭 HTTP 客户端连接。"""
        await self.client.aclose()
