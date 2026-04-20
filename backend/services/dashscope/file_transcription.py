from __future__ import annotations

import time
from http import HTTPStatus
from typing import Any, Optional

import httpx
from tenacity import (
    RetryCallState,
    Retrying,
    retry_if_exception_type,
    retry_if_result,
    stop_after_attempt,
    wait_exponential,
    wait_fixed,
    wait_random,
)

from core.logging_config import get_logger
from services.base import STTRecognitionError, TranscriptionResult

from .payload_parser import DashScopePayloadParser


logger = get_logger(__name__)

DASHSCOPE_TRANSIENT_STATUS_CODES = {
    HTTPStatus.TOO_MANY_REQUESTS,
    HTTPStatus.INTERNAL_SERVER_ERROR,
    HTTPStatus.BAD_GATEWAY,
    HTTPStatus.SERVICE_UNAVAILABLE,
    HTTPStatus.GATEWAY_TIMEOUT,
}
DASHSCOPE_REQUEST_RETRY_ATTEMPTS = 3
DASHSCOPE_REQUEST_RETRY_INITIAL_SECONDS = 0.5
DASHSCOPE_REQUEST_RETRY_MAX_SECONDS = 4.0
DASHSCOPE_REQUEST_RETRY_JITTER_SECONDS = 0.25
DASHSCOPE_TASK_POLL_TIMEOUT_SECONDS = 180
DASHSCOPE_TASK_POLL_INTERVAL_SECONDS = 1.0


class DashScopeTransientRequestError(Exception):
    """标记 DashScope REST 临时失败，供 Tenacity 执行请求级重试。"""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        """保留 HTTP 状态码，便于最终错误和日志定位。"""
        super().__init__(message)
        self.status_code = status_code


class DashScopeFileTranscriber:
    SUBMIT_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
    TASK_URL_PREFIX = "https://dashscope.aliyuncs.com/api/v1/tasks"

    def __init__(
        self,
        *,
        api_key: str,
        file_transcription_model: str,
        diarization_enabled: bool,
        speaker_count: int,
        file_url_mode: str,
        certifi_ca_file: str,
        parser: DashScopePayloadParser,
    ) -> None:
        self.api_key = api_key
        self.file_transcription_model = file_transcription_model
        self.diarization_enabled = diarization_enabled
        self.speaker_count = speaker_count
        self.file_url_mode = file_url_mode
        self.certifi_ca_file = certifi_ca_file
        self.parser = parser

    @staticmethod
    def _elapsed_ms(started_at: float) -> int:
        """把 monotonic 起点转换成毫秒耗时，便于统一打印阶段日志。"""
        return int((time.monotonic() - started_at) * 1000)

    def upload_temp_file_url(self, audio_path: str) -> str:
        """上传临时音频并记录上传耗时，便于判断是否慢在文件传输。"""
        upload_started_at = time.monotonic()
        logger.info("dashscope_file_upload_started", file_url_mode=self.file_url_mode)

        if self.file_url_mode != "temp":
            raise STTRecognitionError(f"unsupported STT_FILE_URL_MODE: {self.file_url_mode}")

        try:
            from dashscope.utils.oss_utils import OssUtils
        except Exception as exc:
            raise STTRecognitionError(f"temp file upload unavailable: {exc}") from exc

        try:
            file_url = OssUtils.upload(
                model=self.file_transcription_model,
                file_path=audio_path,
                api_key=self.api_key,
            )
        except Exception as exc:
            raise STTRecognitionError(f"upload temp URL failed: {exc}") from exc

        if isinstance(file_url, str) and (file_url.startswith("oss://") or file_url.startswith("http")):
            logger.info(
                "dashscope_file_upload_succeeded",
                file_url=file_url,
                elapsed_ms=self._elapsed_ms(upload_started_at),
            )
            return file_url

        raise STTRecognitionError(f"upload temp URL invalid response: {file_url!r}")

    def _dashscope_rest_headers(self, file_url: Optional[str] = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        if isinstance(file_url, str) and file_url.startswith("oss://"):
            headers["X-DashScope-OssResourceResolve"] = "enable"
        return headers

    @staticmethod
    def _parse_rest_error(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text.strip() or f"HTTP {response.status_code}"

        if isinstance(payload, dict):
            return str(payload.get("message") or payload.get("code") or payload)
        return str(payload)

    @staticmethod
    def _is_transient_status(status_code: int) -> bool:
        """判断 HTTP 状态码是否属于可重试的临时失败。"""
        return status_code in DASHSCOPE_TRANSIENT_STATUS_CODES

    @staticmethod
    def _is_pending_task_payload(payload: dict[str, Any]) -> bool:
        """让 Tenacity 根据任务状态判断是否继续轮询。"""
        output = payload.get("output") if isinstance(payload, dict) else None
        task_status = str((output or {}).get("task_status") or "UNKNOWN").upper()
        return task_status != "SUCCEEDED"

    def _build_request_retryer(self, *, method: str, url: str) -> Retrying:
        """构造 DashScope REST 请求重试器，仅处理临时网络和限流错误。"""

        def log_retry(retry_state: RetryCallState) -> None:
            """记录下一次请求重试，保留方法、地址、次数和等待时长。"""
            exception = retry_state.outcome.exception() if retry_state.outcome else None
            sleep_seconds = retry_state.next_action.sleep if retry_state.next_action else 0
            logger.warning(
                "dashscope_request_retrying",
                method=method,
                url=url,
                attempt=retry_state.attempt_number,
                sleep=round(float(sleep_seconds), 3),
                error=str(exception) if exception else "",
            )

        return Retrying(
            retry=retry_if_exception_type(DashScopeTransientRequestError),
            stop=stop_after_attempt(DASHSCOPE_REQUEST_RETRY_ATTEMPTS),
            wait=wait_exponential(
                multiplier=DASHSCOPE_REQUEST_RETRY_INITIAL_SECONDS,
                min=DASHSCOPE_REQUEST_RETRY_INITIAL_SECONDS,
                max=DASHSCOPE_REQUEST_RETRY_MAX_SECONDS,
            )
            + wait_random(0, DASHSCOPE_REQUEST_RETRY_JITTER_SECONDS),
            sleep=time.sleep,
            before_sleep=log_retry,
            reraise=True,
        )

    @staticmethod
    def _build_task_poll_retryer() -> Retrying:
        """构造任务状态轮询器，等待间隔由本模块 time.sleep 控制。"""
        return Retrying(
            retry=retry_if_result(DashScopeFileTranscriber._is_pending_task_payload),
            wait=wait_fixed(DASHSCOPE_TASK_POLL_INTERVAL_SECONDS),
            sleep=time.sleep,
            reraise=True,
        )

    def _request_dashscope_json(
        self,
        client: httpx.Client,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        json_body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        try:
            retryer = self._build_request_retryer(method=method, url=url)
            return retryer(
                self._request_dashscope_json_once,
                client,
                method,
                url,
                headers=headers,
                json_body=json_body,
            )
        except DashScopeTransientRequestError as exc:
            raise STTRecognitionError(f"DashScope request failed after retries: {exc}") from exc

    def _request_dashscope_json_once(
        self,
        client: httpx.Client,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        json_body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """执行一次 DashScope REST 请求，并把临时失败映射为可重试异常。"""
        try:
            response = client.request(method, url, headers=headers, json=json_body)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise DashScopeTransientRequestError(f"DashScope transport error: {exc}") from exc

        if self._is_transient_status(response.status_code):
            message = self._parse_rest_error(response)
            raise DashScopeTransientRequestError(
                f"DashScope request failed temporarily ({response.status_code}): {message}",
                status_code=response.status_code,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise STTRecognitionError(f"DashScope returned non-JSON response: {response.text[:200]}") from exc

        if response.status_code != HTTPStatus.OK:
            message = self._parse_rest_error(response)
            raise STTRecognitionError(f"DashScope request failed ({response.status_code}): {message}")
        if not isinstance(payload, dict):
            raise STTRecognitionError(f"DashScope returned abnormal response: {payload!r}")
        return payload

    def _build_file_transcription_parameters(self, language: str) -> dict[str, Any]:
        parameters: dict[str, Any] = {}
        if self.diarization_enabled:
            parameters["diarization_enabled"] = True
        if language:
            parameters["language_hints"] = [language]
        if self.diarization_enabled and self.speaker_count >= 2:
            parameters["speaker_count"] = self.speaker_count
        return parameters

    @staticmethod
    def _extract_transcription_result_url(payload: dict[str, Any]) -> str:
        output = payload.get("output") if isinstance(payload, dict) else None
        if not isinstance(output, dict):
            raise STTRecognitionError("file transcription failed: missing output")

        results = output.get("results")
        if isinstance(results, list):
            for item in results:
                if not isinstance(item, dict):
                    continue
                result_url = item.get("transcription_url") or item.get("url") or item.get("result_url")
                if isinstance(result_url, str) and result_url:
                    return result_url

        raise STTRecognitionError(f"file transcription failed: missing transcription_url, payload={payload}")

    def _download_transcription_result(self, client: httpx.Client, result_url: str) -> dict[str, Any]:
        """下载最终转写结果并记录下载耗时，便于区分慢在回包还是任务排队。"""
        download_started_at = time.monotonic()
        payload = self._request_dashscope_json(
            client,
            "GET",
            result_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

        if not isinstance(payload, dict):
            raise STTRecognitionError(f"transcription result payload invalid: {payload!r}")
        logger.info(
            "dashscope_transcription_result_downloaded",
            elapsed_ms=self._elapsed_ms(download_started_at),
        )
        return payload

    def run_file_transcription(self, file_url: str, language: str) -> dict[str, Any]:
        """提交录音文件任务并拆分记录提交、轮询和下载三个阶段的耗时。"""
        request_body = {
            "model": self.file_transcription_model,
            "input": {"file_urls": [file_url]},
            "parameters": self._build_file_transcription_parameters(language),
        }

        run_started_at = time.monotonic()
        logger.info("dashscope_file_transcription_submitted", file_url=file_url)
        timeout = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=60.0)
        with httpx.Client(timeout=timeout, verify=self.certifi_ca_file, follow_redirects=True) as client:
            submit_started_at = time.monotonic()
            submit_payload = self._request_dashscope_json(
                client,
                "POST",
                self.SUBMIT_URL,
                headers=self._dashscope_rest_headers(file_url=file_url),
                json_body=request_body,
            )
            output = submit_payload.get("output") or {}
            task_id = output.get("task_id")
            task_status = str(output.get("task_status") or "").upper()
            if not task_id:
                raise STTRecognitionError(f"file transcription missing task_id: {submit_payload}")

            logger.info(
                "dashscope_file_transcription_task_submitted",
                task_id=task_id,
                task_status=task_status,
                submit_elapsed_ms=self._elapsed_ms(submit_started_at),
            )
            deadline = time.monotonic() + DASHSCOPE_TASK_POLL_TIMEOUT_SECONDS
            poll_started_at = time.monotonic()
            poll_state = {"count": 0}
            poll_headers = {"Authorization": f"Bearer {self.api_key}"}
            if isinstance(file_url, str) and file_url.startswith("oss://"):
                poll_headers["X-DashScope-OssResourceResolve"] = "enable"

            poll_retryer = self._build_task_poll_retryer()
            task_payload = poll_retryer(
                self._poll_task_once,
                client,
                task_id,
                poll_headers,
                poll_started_at,
                deadline,
                poll_state,
            )
            result_url = self._extract_transcription_result_url(task_payload)
            logger.info(
                "dashscope_file_transcription_task_succeeded",
                task_id=task_id,
                poll_count=poll_state["count"],
                poll_elapsed_ms=self._elapsed_ms(poll_started_at),
                total_elapsed_ms=self._elapsed_ms(run_started_at),
            )
            return self._download_transcription_result(client, result_url)

    def _poll_task_once(
        self,
        client: httpx.Client,
        task_id: str,
        poll_headers: dict[str, str],
        poll_started_at: float,
        deadline: float,
        poll_state: dict[str, int],
    ) -> dict[str, Any]:
        """查询一次 DashScope 任务状态，终态直接返回或抛错，非终态交给 Tenacity 继续轮询。"""
        poll_state["count"] += 1
        poll_count = poll_state["count"]
        task_payload = self._request_dashscope_json(
            client,
            "GET",
            f"{self.TASK_URL_PREFIX}/{task_id}",
            headers=poll_headers,
        )
        output = task_payload.get("output") or {}
        task_status = str(output.get("task_status") or "UNKNOWN").upper()
        if task_status == "SUCCEEDED":
            return task_payload
        if task_status in {"FAILED", "CANCELED", "UNKNOWN"}:
            message = task_payload.get("message") or output.get("message") or task_status
            raise STTRecognitionError(
                f"file transcription failed: task_id={task_id}, status={task_status}, message={message}"
            )
        if time.monotonic() >= deadline:
            raise STTRecognitionError(f"file transcription timeout: task_id={task_id}, status={task_status}")

        logger.info(
            "dashscope_file_transcription_task_polling",
            task_id=task_id,
            task_status=task_status,
            poll_count=poll_count,
        )
        return task_payload

    def transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        """执行完整录音文件识别，并输出端到端总耗时日志。"""
        transcribe_started_at = time.monotonic()
        file_url = self.upload_temp_file_url(audio_path)
        payload = self.run_file_transcription(file_url=file_url, language=language)
        segments = self.parser.normalize_and_merge_segments(self.parser.extract_segments(payload))
        transcript = self.parser.extract_text(payload) or "".join(segment.text for segment in segments)
        logger.info(
            "dashscope_file_transcription_completed",
            elapsed_ms=self._elapsed_ms(transcribe_started_at),
            transcript_chars=len(transcript),
            speaker_segments=len(segments),
        )

        return TranscriptionResult(
            text=transcript,
            confidence=None,
            duration_ms=None,
            language=language,
            speaker_segments=segments or None,
        )
