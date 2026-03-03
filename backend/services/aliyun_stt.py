"""
阿里云 NLS (智能语音服务) STT 实现。

使用阿里云 NLS SDK 进行语音识别。
支持实时和基于文件的转写。
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
    使用阿里云 NLS 的语音转文本服务。

    支持格式: m4a, mp3, wav, pcm
    针对中文语音识别进行了优化。
    """

    # 默认语言
    DEFAULT_LANGUAGE = "zh-CN"

    def __init__(
        self,
        access_key_id: Optional[str] = None,
        access_key_secret: Optional[str] = None,
        app_key: Optional[str] = None,
        **kwargs
    ):
        """
        初始化阿里云 STT 服务。

        参数:
            access_key_id: 阿里云 Access Key ID
            access_key_secret: 阿里云 Access Key Secret
            app_key: NLS App Key
            **kwargs: 额外配置
        """
        super().__init__(**kwargs)

        self.access_key_id = access_key_id or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID")
        self.access_key_secret = access_key_secret or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
        self.app_key = app_key or os.getenv("ALIBABA_CLOUD_APP_KEY")

        if not all([self.access_key_id, self.access_key_secret, self.app_key]):
            raise STTError(
                "缺少必需的凭证。请设置:\n"
                "  - ALIBABA_CLOUD_ACCESS_KEY_ID\n"
                "  - ALIBABA_CLOUD_ACCESS_KEY_SECRET\n"
                "  - ALIBABA_CLOUD_APP_KEY"
            )

        # 导入 NLS SDK
        try:
            import nls
            self.nls = nls
        except ImportError:
            raise STTError(
                "未安装 alibabacloud-nls 包。"
                "请运行: pip install alibabacloud-nls"
            )

    async def transcribe(
        self,
        audio_path: str,
        audio_format: Optional[AudioFormat] = None,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        将音频文件转写为文本。

        参数:
            audio_path: 音频文件路径
            audio_format: 音频格式 (为 None 时自动检测)
            language_hint: 预期语言 (zh-CN 或 en-US)
            **kwargs: 额外参数

        返回:
            包含转写文本的 TranscriptionResult
        """
        # 检查文件是否存在
        if not os.path.exists(audio_path):
            raise STTFileError(f"未找到音频文件: {audio_path}")

        # 如未提供则检测格式
        if audio_format is None:
            audio_format = self._detect_format(audio_path)

        # 读取音频文件
        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()
        except Exception as e:
            raise STTFileError(f"读取音频文件失败: {str(e)}")

        # 使用 transcribe_bytes
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
        将音频字节转写为文本。

        参数:
            audio_data: 原始音频数据字节
            audio_format: 音频格式
            language_hint: 预期语言
            **kwargs: 额外参数

        返回:
            包含转写文本的 TranscriptionResult
        """
        if not audio_data:
            raise STTFileError("音频数据为空")

        # 将格式映射到采样率和编码
        format_mapping = {
            AudioFormat.M4A: (16000, "m4a"),
            AudioFormat.MP3: (16000, "mp3"),
            AudioFormat.WAV: (16000, "wav"),
            AudioFormat.PCM: (16000, "pcm"),
            AudioFormat.OGG: (16000, "ogg"),
        }

        sample_rate, encoding = format_mapping.get(audio_format, (16000, "m4a"))

        # 使用 asyncio 在线程池中运行阻塞的 NLS SDK
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,  # 使用默认执行器
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
        使用 NLS SDK 进行同步转写。

        在线程池中运行以避免阻塞事件循环。
        """
        result_text = []
        confidence = None
        duration_ms = None
        error_occurred = None

        def on_result(message, result):
            """识别结果的回调函数。"""
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
            """错误的回调函数。"""
            nonlocal error_occurred
            error_occurred = message

        def on_close():
            """连接关闭的回调函数。"""
            pass

        try:
            # 创建识别实例
            recognition = self.nls.NlsSpeechTranscriber(
                akid=self.access_key_id,
                aksecret=self.access_key_secret,
                appkey=self.app_key,
                token=None,  # SDK 将自动生成 token
                on_result=on_result,
                on_error=on_error,
                on_close=on_close,
            )

            # 开始识别
            recognition.start(
                aformat=encoding,
                sample_rate=sample_rate,
                enable_punctuation_prediction=True,
                enable_inverse_text_normalization=True,
                enable_intermediate_result=False,
            )

            # 发送音频数据
            recognition.send_audio(audio_data)

            # 停止识别
            recognition.stop()

            # 检查错误
            if error_occurred:
                raise STTRecognitionError(f"识别错误: {error_occurred}")

            # 合并结果
            final_text = "".join(result_text)
            if not final_text:
                final_text = ""  # 空转写是正常的

            return TranscriptionResult(
                text=final_text,
                confidence=confidence,
                duration_ms=duration_ms,
                language=language_hint
            )

        except (STTError,):
            raise
        except Exception as e:
            raise STTRecognitionError(f"转写失败: {str(e)}")

    async def health_check(self) -> bool:
        """
        检查 STT 服务是否健康。

        返回:
            健康返回 True
        """
        try:
            # 简单的健康检查 - 通过检查 token 生成验证凭证是否有效
            if hasattr(self.nls, 'NlsToken'):
                token = self.nls.NlsToken()
                token.setAccessKeyId(self.access_key_id)
                token.setAccessKeySecret(self.access_key_secret)
                token.apply()
                return True
            return True  # 如果执行到这里，说明 SDK 可用
        except Exception:
            return False
