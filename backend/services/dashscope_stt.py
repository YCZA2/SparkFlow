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
from typing import Any, Optional
import time
from http import HTTPStatus

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
from constants.audio import (
    AUDIO_SAMPLE_RATE,
    BYTES_PER_SECOND,
    CHUNK_SIZE_BYTES,
    MIN_RECOGNITION_WAIT_SECONDS,
    RECOGNITION_POLL_INTERVAL_SECONDS,
    RECOGNITION_TIMEOUT_BUFFER_SECONDS,
    WAV_HEADER_SIZE,
)
from .base import (
    BaseSTTService,
    SpeakerSegment,
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
    FILE_TRANSCRIPTION_MODEL = "paraformer-v2"

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
        self.diarization_enabled = settings.STT_DIARIZATION_ENABLED
        self.speaker_count = max(0, int(settings.STT_DIARIZATION_SPEAKER_COUNT))
        self.file_url_mode = (settings.STT_FILE_URL_MODE or "temp").lower()

        if not self.api_key:
            raise STTError(
                "缺少 DashScope API Key。请设置:\n"
                "  - DASHSCOPE_API_KEY (从 https://dashscope.console.aliyun.com/ 获取)"
            )

        # 设置 dashscope API key
        import dashscope
        dashscope.api_key = self.api_key

        logger.info(
            "[DashScope STT] 服务初始化完成，模型: %s, diarization=%s, speaker_count=%s, file_url_mode=%s",
            self.model,
            self.diarization_enabled,
            self.speaker_count,
            self.file_url_mode,
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
            loop = asyncio.get_event_loop()

            if self.diarization_enabled:
                try:
                    logger.info(
                        "[DashScope STT] diarization 主链路启用，file_url_mode=%s, speaker_count=%s",
                        self.file_url_mode,
                        self.speaker_count,
                    )
                    result = await loop.run_in_executor(
                        None,
                        self._transcribe_with_diarization,
                        audio_path,
                        language,
                    )
                    logger.info(
                        "[DashScope STT] diarization 成功，segments=%s",
                        len(result.speaker_segments or []),
                    )
                    return result
                except Exception as diarization_error:
                    logger.warning(
                        "[DashScope STT] diarization 失败，回退实时识别: %s",
                        str(diarization_error),
                    )

            result = await loop.run_in_executor(
                None,
                self._recognize_file,
                audio_path,
                format_str,
                language
            )

            logger.info(f"[DashScope STT] 回退链路转写成功: {result.text[:50] if result.text else '(空)'}...")
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
            except Exception:
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
            audio = audio.set_channels(1).set_frame_rate(AUDIO_SAMPLE_RATE).set_sample_width(2)

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

    def _convert_audio_if_needed(self, audio_path: str, format_str: str) -> tuple[str, str, Optional[str]]:
        """Convert input audio to WAV when needed."""
        try:
            audio_path_to_use = self._convert_to_wav(audio_path)
            if audio_path_to_use != audio_path:
                return audio_path_to_use, "wav", audio_path_to_use
            return audio_path_to_use, format_str, None
        except Exception as e:
            logger.warning(f"[DashScope STT] 音频转换失败，使用原始文件: {e}")
            return audio_path, format_str, None

    def _upload_temp_file_url(self, audio_path: str) -> str:
        """Upload local audio file and return a temporary URL for file transcription APIs."""
        logger.info("[DashScope STT] 上传临时文件 URL，模式: %s", self.file_url_mode)

        if self.file_url_mode != "temp":
            raise STTRecognitionError(f"不支持的 STT_FILE_URL_MODE: {self.file_url_mode}")

        try:
            from dashscope.utils.oss_utils import upload_file
        except Exception as exc:
            raise STTRecognitionError(f"临时 URL 上传能力不可用: {exc}") from exc

        upload_attempts: list[tuple[tuple[Any, ...], dict[str, Any]]] = [
            ((audio_path, self.api_key), {}),
            ((audio_path,), {"api_key": self.api_key}),
            ((), {"file_path": audio_path, "api_key": self.api_key}),
            ((), {"model": self.FILE_TRANSCRIPTION_MODEL, "file_path": audio_path, "api_key": self.api_key}),
        ]

        last_error: Optional[Exception] = None
        for args, kwargs in upload_attempts:
            try:
                url = upload_file(*args, **kwargs)
                if isinstance(url, str) and url.startswith("http"):
                    logger.info("[DashScope STT] 临时 URL 上传成功")
                    return url
            except TypeError:
                continue
            except Exception as exc:
                last_error = exc

        if last_error:
            raise STTRecognitionError(f"上传临时 URL 失败: {last_error}") from last_error
        raise STTRecognitionError("上传临时 URL 失败: 未获取有效 URL")

    def _extract_segments_from_payload(self, payload: Any) -> list[SpeakerSegment]:
        """Parse diarization speaker segments from transcription payload."""
        if not payload:
            return []

        candidates: list[dict[str, Any]] = []
        if isinstance(payload, dict):
            maybe_sentences = payload.get("sentences") or payload.get("segments")
            if isinstance(maybe_sentences, list):
                candidates.extend(item for item in maybe_sentences if isinstance(item, dict))

            maybe_results = payload.get("results") or payload.get("output")
            if isinstance(maybe_results, list):
                for item in maybe_results:
                    if not isinstance(item, dict):
                        continue
                    segments = item.get("sentences") or item.get("segments")
                    if isinstance(segments, list):
                        candidates.extend(seg for seg in segments if isinstance(seg, dict))
        elif isinstance(payload, list):
            candidates.extend(item for item in payload if isinstance(item, dict))

        parsed: list[SpeakerSegment] = []
        for item in candidates:
            speaker_raw = self._pick_first_defined(
                item,
                ("speaker_id", "speakerId", "speaker", "spk"),
            )
            text = str(item.get("text") or "").strip()
            start_raw = self._pick_first_defined(
                item,
                ("start_ms", "begin_time", "start_time", "start"),
            )
            end_raw = self._pick_first_defined(
                item,
                ("end_ms", "end_time", "stop_time", "end"),
            )

            if speaker_raw is None or not text:
                continue
            try:
                start_ms = int(float(start_raw))
                end_ms = int(float(end_raw))
            except (TypeError, ValueError):
                continue
            if end_ms < start_ms:
                continue

            parsed.append(
                SpeakerSegment(
                    speaker_id=str(speaker_raw),
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=text,
                )
            )

        return parsed

    def _normalize_and_merge_segments(self, segments: list[SpeakerSegment]) -> list[SpeakerSegment]:
        if not segments:
            return []

        sorted_segments = sorted(segments, key=lambda s: (s.start_ms, s.end_ms))
        merged: list[SpeakerSegment] = []
        for segment in sorted_segments:
            if not merged:
                merged.append(segment)
                continue

            last = merged[-1]
            if segment.speaker_id == last.speaker_id and segment.start_ms <= last.end_ms + 1:
                merged[-1] = SpeakerSegment(
                    speaker_id=last.speaker_id,
                    start_ms=last.start_ms,
                    end_ms=max(last.end_ms, segment.end_ms),
                    text=f"{last.text}{segment.text}",
                )
                continue

            merged.append(segment)
        return merged

    def _pick_first_defined(self, data: dict[str, Any], keys: tuple[str, ...]) -> Any:
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        return None

    def _extract_text_from_payload(self, payload: Any) -> str:
        if isinstance(payload, dict):
            for key in ("text", "transcript", "result"):
                value = payload.get(key)
                if isinstance(value, str):
                    return value.strip()
            maybe_sentences = payload.get("sentences") or payload.get("segments")
            if isinstance(maybe_sentences, list):
                return "".join(
                    str(item.get("text") or "").strip()
                    for item in maybe_sentences
                    if isinstance(item, dict) and item.get("text")
                )
            maybe_results = payload.get("results")
            if isinstance(maybe_results, list):
                return "".join(
                    self._extract_text_from_payload(item)
                    for item in maybe_results
                    if isinstance(item, dict)
                )
        return ""

    def _convert_response_payload(self, response: Any) -> dict[str, Any]:
        """Convert different SDK response objects to a plain dict."""
        if isinstance(response, dict):
            return response

        if hasattr(response, "output") and isinstance(response.output, dict):
            payload = dict(response.output)
        else:
            payload = {}

        if hasattr(response, "status_code"):
            payload["_status_code"] = int(response.status_code)
        if hasattr(response, "message") and response.message:
            payload["_message"] = str(response.message)
        return payload

    def _run_file_transcription(self, file_url: str, language: str) -> dict[str, Any]:
        """Run recorded-file transcription API with diarization."""
        try:
            from dashscope.audio.asr import Transcription
        except Exception as exc:
            raise STTRecognitionError(f"未找到 Transcription 接口: {exc}") from exc

        transcription_model = self.FILE_TRANSCRIPTION_MODEL
        language_hints = [language] if language else None
        parameters = {
            "diarization_enabled": True,
            "speaker_count": self.speaker_count,
        }

        attempts: list[tuple[tuple[Any, ...], dict[str, Any]]] = [
            (
                (),
                {
                    "model": transcription_model,
                    "file_urls": [file_url],
                    "language_hints": language_hints,
                    "parameters": parameters,
                },
            ),
            (
                (),
                {
                    "model": transcription_model,
                    "file_urls": [file_url],
                    "language_hints": language_hints,
                    "diarization_enabled": True,
                    "speaker_count": self.speaker_count,
                },
            ),
        ]

        last_error: Optional[Exception] = None
        for args, kwargs in attempts:
            try:
                response = Transcription.call(*args, **kwargs)
                payload = self._convert_response_payload(response)
                status_code = payload.get("_status_code")
                if status_code is not None and status_code != HTTPStatus.OK:
                    message = payload.get("_message") or "未知错误"
                    raise STTRecognitionError(f"录音文件识别失败: {message}")
                return payload
            except TypeError:
                continue
            except Exception as exc:
                last_error = exc

        if last_error:
            raise STTRecognitionError(f"录音文件识别失败: {last_error}") from last_error
        raise STTRecognitionError("录音文件识别失败: 未命中可用调用签名")

    def _transcribe_with_diarization(
        self,
        audio_path: str,
        language: str,
    ) -> TranscriptionResult:
        file_url = self._upload_temp_file_url(audio_path)
        payload = self._run_file_transcription(file_url=file_url, language=language)

        segments = self._normalize_and_merge_segments(self._extract_segments_from_payload(payload))
        transcript = self._extract_text_from_payload(payload)
        if not transcript:
            transcript = "".join(segment.text for segment in segments)

        return TranscriptionResult(
            text=transcript,
            confidence=None,
            duration_ms=None,
            language=language,
            speaker_segments=segments or None,
        )

    def _read_audio_data(self, audio_path: str, format_str: str) -> bytes:
        """
        Read audio bytes for streaming recognition.

        WAV files skip the fixed header block when valid.
        """
        with open(audio_path, 'rb') as audio_file:
            header = audio_file.read(WAV_HEADER_SIZE)
            if len(header) < WAV_HEADER_SIZE:
                raise STTFileError(f"音频文件太小: {audio_path}")

            if format_str == "wav" and header[:4] != b"RIFF":
                logger.warning("[DashScope STT] 非 WAV 文件格式，跳过文件头处理")
                audio_file.seek(0)

            return audio_file.read()

    def _stream_recognize(self, recognition: Recognition, audio_data: bytes) -> None:
        """Send audio frames in fixed-size chunks."""
        for offset in range(0, len(audio_data), CHUNK_SIZE_BYTES):
            recognition.send_audio_frame(audio_data[offset:offset + CHUNK_SIZE_BYTES])

    def _wait_for_result(self, callback: SimpleRecognitionCallback, audio_data_size: int) -> None:
        """Wait until recognition completes or reaches timeout."""
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
            logger.warning(f"[DashScope STT] 识别超时（等待 {wait_time:.1f} 秒）")

        if callback.error:
            error_msg = callback.error.message if hasattr(callback.error, "message") else "未知错误"
            logger.error(f"[DashScope STT] 识别失败: {error_msg}")
            raise STTRecognitionError(f"识别失败: {error_msg}")

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

        audio_path_to_use, format_to_use, temp_wav_path = self._convert_audio_if_needed(audio_path, format_str)

        try:
            callback = SimpleRecognitionCallback()
            recognition = Recognition(
                model=self.model,
                callback=callback,
                format=format_to_use,
                sample_rate=AUDIO_SAMPLE_RATE,
            )

            logger.info("[DashScope STT] 启动流式识别...")
            recognition.start()

            audio_data = self._read_audio_data(audio_path_to_use, format_to_use)
            logger.info(f"[DashScope STT] 音频数据大小: {len(audio_data)} bytes")

            self._stream_recognize(recognition, audio_data)
            logger.info("[DashScope STT] 音频发送完成，等待识别结果...")

            recognition.stop()
            self._wait_for_result(callback, len(audio_data))

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
        return bool(self.api_key)

    async def close(self):
        """关闭服务（SDK 无需显式关闭）。"""
        pass
