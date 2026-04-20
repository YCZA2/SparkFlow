"""DashScope 内部实现测试。"""

from __future__ import annotations

from itertools import chain, repeat
import logging
from unittest.mock import patch

import httpx
import pytest

from services.base import STTRecognitionError
from services.dashscope.file_transcription import DashScopeFileTranscriber
from services.dashscope.payload_parser import DashScopePayloadParser


class _FakeHttpClient:
    """用于替代 httpx.Client 的最小上下文管理器。"""

    def __init__(self, responses=None):
        """初始化响应队列和请求记录。"""
        self.responses = list(responses or [])
        self.requests = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def request(self, method, url, **kwargs):
        """按队列返回响应或抛出异常，模拟 httpx.Client.request。"""
        self.requests.append((method, url, kwargs))
        if not self.responses:
            raise AssertionError("unexpected request call")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


class _FakeResponse:
    """模拟 httpx.Response 的最小状态码、JSON 和文本接口。"""

    def __init__(self, status_code: int = 200, payload=None, text: str = ""):
        """初始化响应状态和载荷。"""
        self.status_code = status_code
        self.payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        """返回预设 JSON 载荷。"""
        return self.payload


@pytest.fixture
def parser() -> DashScopePayloadParser:
    """提供可复用的 DashScope 载荷解析器。"""
    return DashScopePayloadParser()


def _build_transcriber(parser: DashScopePayloadParser) -> DashScopeFileTranscriber:
    """构造测试用文件转写器。"""
    return DashScopeFileTranscriber(
        api_key="test-key",
        file_transcription_model="paraformer-v2",
        diarization_enabled=True,
        speaker_count=2,
        file_url_mode="temp",
        certifi_ca_file="/tmp/ca.pem",
        parser=parser,
    )


def _submit_response(task_status: str = "RUNNING") -> _FakeResponse:
    """构造任务提交响应。"""
    return _FakeResponse(payload={"output": {"task_id": "task-1", "task_status": task_status}})


def _task_response(task_status: str, **extra_output) -> _FakeResponse:
    """构造任务状态响应。"""
    return _FakeResponse(payload={"output": {"task_status": task_status, **extra_output}})


def _result_response(payload=None) -> _FakeResponse:
    """构造转写结果下载响应。"""
    return _FakeResponse(payload=payload or {"transcript": "你好世界"})


def test_payload_parser_extracts_sentence_level_speaker_segments(parser: DashScopePayloadParser) -> None:
    """分段解析应保留句级切片，不把同说话人的相邻句子折叠成一大段。"""
    payload = {
        "output": {
            "results": [
                {
                    "segments": [
                        {"speaker_id": "s1", "text": "你好", "start_ms": "0", "end_ms": "100"},
                        {"speaker_id": "s1", "text": "世界", "start_ms": "100", "end_ms": "200"},
                        {"speaker_id": "s2", "text": "!", "start_ms": "220", "end_ms": "260"},
                    ]
                }
            ]
        }
    }

    segments = parser.extract_segments(payload)
    merged = parser.normalize_and_merge_segments(segments)

    assert len(merged) == 3
    assert merged[0].speaker_id == "s1"
    assert merged[0].text == "你好"
    assert merged[1].speaker_id == "s1"
    assert merged[1].text == "世界"
    assert merged[2].speaker_id == "s2"


def test_payload_parser_merges_overlapping_duplicate_segments(parser: DashScopePayloadParser) -> None:
    """重复回包导致的重叠片段应被规整为一条，避免时间线重复。"""
    merged = parser.normalize_and_merge_segments(
        [
            parser.extract_segments(
                {
                    "segments": [
                        {"speaker_id": "s1", "text": "你好", "start_ms": "0", "end_ms": "100"},
                        {"speaker_id": "s1", "text": "你好", "start_ms": "50", "end_ms": "120"},
                    ]
                }
            )[0],
            parser.extract_segments(
                {
                    "segments": [
                        {"speaker_id": "s1", "text": "你好", "start_ms": "50", "end_ms": "120"},
                    ]
                }
            )[0],
        ]
    )

    assert len(merged) == 1
    assert merged[0].start_ms == 0
    assert merged[0].end_ms == 120


def test_payload_parser_extracts_text_from_nested_payload(parser: DashScopePayloadParser) -> None:
    """嵌套句子结构应被拼接为最终文本。"""
    payload = {
        "output": {
            "results": [
                {
                    "sentences": [
                        {"text": "第一句"},
                        {"text": "第二句"},
                    ]
                }
            ]
        }
    }

    assert parser.extract_text(payload) == "第一句第二句"


def test_file_transcriber_raises_timeout_when_task_never_finishes(parser: DashScopePayloadParser) -> None:
    """轮询超过超时时间应抛出识别超时异常。"""
    transcriber = _build_transcriber(parser)

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=_FakeHttpClient()):
        with patch.object(
            transcriber,
            "_request_dashscope_json",
            side_effect=[
                {"output": {"task_id": "task-1", "task_status": "RUNNING"}},
                {"output": {"task_status": "RUNNING"}},
            ],
        ):
            with patch(
                "services.dashscope.file_transcription.time.monotonic",
                side_effect=chain([0, 0, 0, 0, 0, 181], repeat(181)),
            ):
                with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
                    with pytest.raises(STTRecognitionError):
                        transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")


def test_file_transcriber_logs_stage_timings(parser: DashScopePayloadParser, caplog: pytest.LogCaptureFixture) -> None:
    """成功链路应输出提交、轮询、下载和总耗时日志。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient(
        [
            _submit_response(),
            _task_response("RUNNING"),
            _task_response("SUCCEEDED", results=[{"transcription_url": "https://example.com/result.json"}]),
            _result_response(),
        ]
    )

    with caplog.at_level(logging.INFO):
        with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
            with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
                transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "dashscope_file_transcription_task_submitted" in messages
    assert "dashscope_file_transcription_task_succeeded" in messages
    assert "dashscope_transcription_result_downloaded" in messages
    assert "submit_elapsed_ms" in messages
    assert "poll_elapsed_ms" in messages
    assert "total_elapsed_ms" in messages
    assert "elapsed_ms" in messages


def test_file_transcriber_retries_transient_http_status(parser: DashScopePayloadParser, caplog: pytest.LogCaptureFixture) -> None:
    """DashScope 临时 HTTP 失败应按请求级策略重试后继续成功。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient(
        [
            _FakeResponse(status_code=503, payload={"message": "busy"}),
            _submit_response(),
            _task_response("SUCCEEDED", results=[{"transcription_url": "https://example.com/result.json"}]),
            _result_response(),
        ]
    )

    with caplog.at_level(logging.WARNING):
        with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
            with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
                payload = transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    assert payload == {"transcript": "你好世界"}
    assert len(client.requests) == 4
    assert "dashscope_request_retrying" in "\n".join(record.getMessage() for record in caplog.records)


def test_file_transcriber_does_not_retry_bad_request(parser: DashScopePayloadParser) -> None:
    """DashScope 明确参数错误不应被请求级重试掩盖。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient([_FakeResponse(status_code=400, payload={"message": "bad request"})])

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
        with pytest.raises(STTRecognitionError):
            transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    assert len(client.requests) == 1


def test_file_transcriber_retries_transport_error(parser: DashScopePayloadParser) -> None:
    """网络抖动类 transport error 应触发请求级重试。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient(
        [
            httpx.ReadTimeout("read timeout"),
            _submit_response(),
            _task_response("SUCCEEDED", results=[{"transcription_url": "https://example.com/result.json"}]),
            _result_response(),
        ]
    )

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
        with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
            payload = transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    assert payload == {"transcript": "你好世界"}
    assert len(client.requests) == 4


def test_file_transcriber_retries_transient_download_status(parser: DashScopePayloadParser) -> None:
    """最终结果下载遇到限流时也应复用同一套请求级重试。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient(
        [
            _submit_response(),
            _task_response("SUCCEEDED", results=[{"transcription_url": "https://example.com/result.json"}]),
            _FakeResponse(status_code=429, payload={"message": "rate limited"}),
            _result_response({"transcript": "限流后成功"}),
        ]
    )

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
        with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
            payload = transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    assert payload == {"transcript": "限流后成功"}
    assert len(client.requests) == 4


@pytest.mark.parametrize("task_status", ["FAILED", "CANCELED", "UNKNOWN"])
def test_file_transcriber_does_not_retry_terminal_task_failure(parser: DashScopePayloadParser, task_status: str) -> None:
    """DashScope 任务明确失败或取消时应直接抛错，不进入轮询重试。"""
    transcriber = _build_transcriber(parser)
    client = _FakeHttpClient(
        [
            _submit_response(),
            _task_response(task_status, message="terminal"),
        ]
    )

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=client):
        with pytest.raises(STTRecognitionError):
            transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")

    assert len(client.requests) == 2
