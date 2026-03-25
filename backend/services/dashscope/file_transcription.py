from __future__ import annotations

import logging
import time
from http import HTTPStatus
from typing import Any, Optional

import httpx

from services.base import STTRecognitionError, TranscriptionResult

from .payload_parser import DashScopePayloadParser


logger = logging.getLogger(__name__)


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
        logger.info("[DashScope STT] upload temp file url, mode=%s", self.file_url_mode)

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
                "[DashScope STT] temp URL upload succeeded: %s (elapsed_ms=%s)",
                file_url,
                self._elapsed_ms(upload_started_at),
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

    def _request_dashscope_json(
        self,
        client: httpx.Client,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        json_body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        response = client.request(method, url, headers=headers, json=json_body)
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
        response = client.get(result_url, headers={"Authorization": f"Bearer {self.api_key}"})
        if response.status_code != HTTPStatus.OK:
            message = self._parse_rest_error(response)
            raise STTRecognitionError(f"download transcription result failed ({response.status_code}): {message}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise STTRecognitionError(f"transcription result is not JSON: {response.text[:200]}") from exc

        if not isinstance(payload, dict):
            raise STTRecognitionError(f"transcription result payload invalid: {payload!r}")
        logger.info(
            "[DashScope STT] transcription result downloaded: elapsed_ms=%s",
            self._elapsed_ms(download_started_at),
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
        logger.info("[DashScope STT] submit file transcription, file_url=%s", file_url)
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
                "[DashScope STT] task submitted: task_id=%s status=%s submit_elapsed_ms=%s",
                task_id,
                task_status,
                self._elapsed_ms(submit_started_at),
            )
            deadline = time.monotonic() + 180
            poll_started_at = time.monotonic()
            poll_count = 0
            poll_headers = {"Authorization": f"Bearer {self.api_key}"}
            if isinstance(file_url, str) and file_url.startswith("oss://"):
                poll_headers["X-DashScope-OssResourceResolve"] = "enable"

            while True:
                poll_count += 1
                task_payload = self._request_dashscope_json(
                    client,
                    "GET",
                    f"{self.TASK_URL_PREFIX}/{task_id}",
                    headers=poll_headers,
                )
                output = task_payload.get("output") or {}
                task_status = str(output.get("task_status") or "UNKNOWN").upper()
                if task_status == "SUCCEEDED":
                    result_url = self._extract_transcription_result_url(task_payload)
                    logger.info(
                        "[DashScope STT] task succeeded: task_id=%s poll_count=%s poll_elapsed_ms=%s total_elapsed_ms=%s",
                        task_id,
                        poll_count,
                        self._elapsed_ms(poll_started_at),
                        self._elapsed_ms(run_started_at),
                    )
                    return self._download_transcription_result(client, result_url)
                if task_status in {"FAILED", "CANCELED", "UNKNOWN"}:
                    message = task_payload.get("message") or output.get("message") or task_status
                    raise STTRecognitionError(
                        f"file transcription failed: task_id={task_id}, status={task_status}, message={message}"
                    )
                if time.monotonic() >= deadline:
                    raise STTRecognitionError(f"file transcription timeout: task_id={task_id}, status={task_status}")

                logger.info("[DashScope STT] polling task: task_id=%s status=%s", task_id, task_status)
                time.sleep(1)

    def transcribe_recorded_file(self, audio_path: str, language: str) -> TranscriptionResult:
        """执行完整录音文件识别，并输出端到端总耗时日志。"""
        transcribe_started_at = time.monotonic()
        file_url = self.upload_temp_file_url(audio_path)
        payload = self.run_file_transcription(file_url=file_url, language=language)
        segments = self.parser.normalize_and_merge_segments(self.parser.extract_segments(payload))
        transcript = self.parser.extract_text(payload) or "".join(segment.text for segment in segments)
        logger.info(
            "[DashScope STT] file transcription completed: elapsed_ms=%s transcript_chars=%s speaker_segments=%s",
            self._elapsed_ms(transcribe_started_at),
            len(transcript),
            len(segments),
        )

        return TranscriptionResult(
            text=transcript,
            confidence=None,
            duration_ms=None,
            language=language,
            speaker_segments=segments or None,
        )
