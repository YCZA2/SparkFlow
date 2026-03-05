"""
DashScope (阿里云百炼/灵积平台) STT 实现。

使用阿里云 dashscope SDK 进行语音识别，支持 paraformer 系列模型。
比 NLS 更简洁，仅需一个 API Key 即可使用。
"""

import os
import ssl
import certifi
import asyncio
import logging
from typing import Optional

# 修复 macOS SSL 证书问题
# 必须在导入 aiohttp/dashscope 之前设置
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# 使用 certifi 证书创建默认 SSL 上下文
# 注意：_create_unverified_context 在某些情况下会导致连接失败
_original_create_default_https_context = ssl._create_default_https_context
ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())

from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

from core.config import settings
from .base import (
    BaseSTTService,
    TranscriptionResult,
    AudioFormat,
    STTError,
    STTFileError,
    STTRecognitionError,
)

# 配置日志记录器
logger = logging.getLogger(__name__)


class SimpleRecognitionCallback(RecognitionCallback):
    """简单的语音识别回调，用于同步获取结果。"""

    def __init__(self):
        self.sentences = []  # 存储完整的句子（sentence_end=True）
        self.error = None
        self.completed = False

    def on_open(self) -> None:
        logger.debug("[DashScope STT] WebSocket 连接已打开")

    def on_complete(self) -> None:
        logger.debug("[DashScope STT] 识别完成")
        self.completed = True

    def on_error(self, result: RecognitionResult) -> None:
        logger.error(f"[DashScope STT] 识别错误: code={result.status_code}, message={result.message}")
        self.error = result

    def on_close(self) -> None:
        logger.debug("[DashScope STT] WebSocket 连接已关闭")

    def on_event(self, result: RecognitionResult) -> None:
        """处理识别事件，提取完整句子"""
        sentence = result.get_sentence()
        if sentence:
            # 检查是否为完整句子（sentence_end=True）
            if isinstance(sentence, dict):
                # 只在句子结束时收集，避免重复
                if sentence.get('sentence_end', False) and sentence.get('text'):
                    self.sentences.append(sentence['text'])
            elif isinstance(sentence, list):
                for s in sentence:
                    if isinstance(s, dict) and s.get('sentence_end', False) and s.get('text'):
                        self.sentences.append(s['text'])


class DashScopeSTTService(BaseSTTService):
    """
    阿里云百炼/灵积平台语音识别服务。

    支持模型:
    - paraformer-realtime-v2: 流式语音识别 (用于文件识别)
    - paraformer-v2: 非流式语音识别

    仅需 DASHSCOPE_API_KEY 即可使用，无需 AccessKey/AppKey 组合。
    """

    # 默认模型 - paraformer-realtime-v2 支持更多音频格式
    DEFAULT_MODEL = "paraformer-realtime-v2"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ):
        """
        初始化百炼 STT 服务。

        参数:
            api_key: DashScope API Key (sk-...)
            model: 模型名称，默认 paraformer-realtime-v2
            **kwargs: 其他配置
        """
        super().__init__(**kwargs)

        self.api_key = api_key or settings.DASHSCOPE_API_KEY
        self.model = model or self.DEFAULT_MODEL

        if not self.api_key:
            raise STTError(
                "缺少 DashScope API Key。请设置:\n"
                "  - DASHSCOPE_API_KEY (从 https://dashscope.console.aliyun.com/ 获取)"
            )

        # 设置 dashscope API key
        import dashscope
        dashscope.api_key = self.api_key

        logger.info(f"[DashScope STT] 服务初始化完成，模型: {self.model}")

    async def transcribe(
        self,
        audio_path: str,
        audio_format: Optional[AudioFormat] = None,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        转写音频文件为文本。

        参数:
            audio_path: 音频文件路径
            audio_format: 音频格式 (None 则自动检测)
            language_hint: 语言提示 (zh-CN, en-US, 等)
            **kwargs: 额外参数

        返回:
            TranscriptionResult 包含转写结果
        """
        # 检查文件存在
        if not os.path.exists(audio_path):
            raise STTFileError(f"音频文件不存在: {audio_path}")

        logger.info(f"[DashScope STT] 开始转写: {audio_path}")

        # 检测格式
        if audio_format is None:
            audio_format = self._detect_format(audio_path)

        # 映射格式到 dashscope 格式
        format_mapping = {
            AudioFormat.M4A: "m4a",
            AudioFormat.MP3: "mp3",
            AudioFormat.WAV: "wav",
            AudioFormat.PCM: "pcm",
            AudioFormat.OGG: "ogg",
        }
        format_str = format_mapping.get(audio_format, "m4a")

        # 支持的语言参数映射
        language_map = {
            "zh-CN": "zh",
            "en-US": "en",
            "ja-JP": "ja",
            "ko-KR": "ko",
            "yue": "yue",  # 粤语
        }
        language = language_map.get(language_hint, "zh")

        logger.info(f"[DashScope STT] 音频格式: {format_str}, 语言: {language}")

        try:
            # 使用 run_in_executor 将同步 SDK 调用转为异步
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self._recognize_file,
                audio_path,
                format_str,
                language
            )

            logger.info(f"[DashScope STT] 转写成功: {result.text[:50] if result.text else '(空)'}...")
            return result

        except STTError:
            raise
        except Exception as e:
            logger.error(f"[DashScope STT] 转写失败: {str(e)}")
            raise STTRecognitionError(f"语音识别失败: {str(e)}")

    async def transcribe_bytes(
        self,
        audio_data: bytes,
        audio_format: AudioFormat,
        language_hint: Optional[str] = "zh-CN",
        **kwargs
    ) -> TranscriptionResult:
        """
        转写音频数据为文本。

        参数:
            audio_data: 音频二进制数据
            audio_format: 音频格式
            language_hint: 语言提示
            **kwargs: 额外参数

        返回:
            TranscriptionResult 包含转写结果
        """
        if not audio_data:
            raise STTFileError("音频数据为空")

        # 先保存到临时文件，然后用 Recognition.call
        import tempfile

        format_mapping = {
            AudioFormat.M4A: "m4a",
            AudioFormat.MP3: "mp3",
            AudioFormat.WAV: "wav",
            AudioFormat.PCM: "pcm",
            AudioFormat.OGG: "ogg",
        }
        format_str = format_mapping.get(audio_format, "m4a")

        # 创建临时文件
        with tempfile.NamedTemporaryFile(suffix=f".{format_str}", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            result = await self.transcribe(temp_path, audio_format, language_hint, **kwargs)
            return result
        finally:
            # 清理临时文件
            try:
                os.unlink(temp_path)
            except:
                pass

    def _convert_to_wav(self, audio_path: str) -> str:
        """
        将音频文件转换为 WAV 格式。

        参数:
            audio_path: 原始音频文件路径

        返回:
            转换后的 WAV 文件路径
        """
        import tempfile

        # 如果已经是 WAV 格式，直接返回
        if audio_path.lower().endswith('.wav'):
            return audio_path

        # 尝试使用 pydub 转换
        try:
            from pydub import AudioSegment

            # 加载音频文件
            audio = AudioSegment.from_file(audio_path)

            # 转换为单声道 16kHz WAV
            audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)

            # 保存为临时 WAV 文件
            temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            temp_wav_path = temp_wav.name
            temp_wav.close()

            audio.export(temp_wav_path, format='wav')
            logger.info(f"[DashScope STT] 已将音频转换为 WAV: {temp_wav_path}")
            return temp_wav_path

        except ImportError:
            logger.warning("[DashScope STT] pydub 未安装，尝试直接发送原始文件")
            return audio_path
        except Exception as e:
            logger.warning(f"[DashScope STT] 音频转换失败: {e}，尝试直接发送原始文件")
            return audio_path

    def _recognize_file(
        self,
        audio_path: str,
        format_str: str,
        language: str,
    ) -> TranscriptionResult:
        """
        使用 Recognition 类进行流式文件识别。

        使用 dashscope SDK 的 Recognition.start() + send_audio_frame() + stop() 方法。
        注意：Recognition.call() 方法对某些格式支持不佳，使用流式方式更可靠。
        """
        logger.info(f"[DashScope STT] 调用 SDK: model={self.model}, format={format_str}")

        # 转换为 WAV 格式（16kHz 单声道）
        temp_wav_path = None
        try:
            audio_path_to_use = self._convert_to_wav(audio_path)
            if audio_path_to_use != audio_path:
                temp_wav_path = audio_path_to_use
                format_str = "wav"
        except Exception as e:
            logger.warning(f"[DashScope STT] 音频转换失败，使用原始文件: {e}")

        try:
            # 创建回调
            callback = SimpleRecognitionCallback()

            # 创建 Recognition 实例
            recognition = Recognition(
                model=self.model,
                callback=callback,
                format=format_str,
                sample_rate=16000,
            )

            # 使用流式方式：start -> send_audio_frame -> stop
            # 这比 Recognition.call() 更可靠
            logger.info("[DashScope STT] 启动流式识别...")

            # 启动识别
            recognition.start()

            # 读取音频文件并发送
            # 注意：WAV 文件需要跳过 44 字节的文件头
            with open(audio_path_to_use, 'rb') as f:
                # 检查是否为 WAV 文件
                header = f.read(44)
                if len(header) < 44:
                    raise STTFileError(f"音频文件太小: {audio_path_to_use}")

                # 验证 WAV 文件头
                if format_str == 'wav' and header[:4] != b'RIFF':
                    logger.warning("[DashScope STT] 非 WAV 文件格式，跳过文件头处理")
                    f.seek(0)
                # 读取剩余音频数据
                audio_data = f.read()

            logger.info(f"[DashScope STT] 音频数据大小: {len(audio_data)} bytes")

            # 分块发送音频数据（每块约 0.2 秒）
            chunk_size = 3200  # 16000 * 0.2 = 3200 bytes
            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i:i+chunk_size]
                recognition.send_audio_frame(chunk)

            logger.info("[DashScope STT] 音频发送完成，等待识别结果...")

            # 停止识别
            recognition.stop()

            # 等待识别完成
            # 根据音频时长动态计算超时时间：音频时长 + 5秒缓冲
            # 16kHz 单声道 16bit 音频：每秒 32000 bytes
            audio_duration = len(audio_data) / 32000  # 音频时长（秒）
            max_wait = max(10, audio_duration + 5)  # 至少10秒，或音频时长+5秒

            import time
            wait_time = 0
            while not callback.completed and not callback.error and wait_time < max_wait:
                time.sleep(0.1)
                wait_time += 0.1

            # 检查是否超时
            if not callback.completed and not callback.error:
                logger.warning(f"[DashScope STT] 识别超时（等待 {wait_time:.1f} 秒）")

            # 检查错误
            if callback.error:
                error_msg = callback.error.message if hasattr(callback.error, 'message') else "未知错误"
                logger.error(f"[DashScope STT] 识别失败: {error_msg}")
                raise STTRecognitionError(f"识别失败: {error_msg}")

            # 合并所有完整句子
            full_text = "".join(callback.sentences)
            logger.info(f"[DashScope STT] 识别成功: {full_text[:50] if full_text else '(空)'}...")

            return TranscriptionResult(
                text=full_text,
                confidence=None,
                duration_ms=None,
                language=language,
            )

        except STTError:
            raise
        except Exception as e:
            logger.error(f"[DashScope STT] SDK 异常: {type(e).__name__}: {str(e)}")
            raise STTRecognitionError(f"识别异常: {str(e)}")
        finally:
            # 清理临时 WAV 文件
            if temp_wav_path and os.path.exists(temp_wav_path):
                try:
                    os.unlink(temp_wav_path)
                    logger.debug(f"[DashScope STT] 已清理临时文件: {temp_wav_path}")
                except Exception as e:
                    logger.warning(f"[DashScope STT] 清理临时文件失败: {e}")

    async def health_check(self) -> bool:
        """
        检查服务健康状态。

        返回:
            True 如果服务可用
        """
        try:
            if not self.api_key:
                return False
            # 简单检查 API key 是否设置，不进行实际调用
            return True
        except Exception:
            return False

    async def close(self):
        """关闭服务（SDK 无需显式关闭）。"""
        pass
