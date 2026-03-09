"""DashScope 内部实现测试。"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from services.base import STTRecognitionError
from services.dashscope.file_transcription import DashScopeFileTranscriber
from services.dashscope.payload_parser import DashScopePayloadParser


class _FakeHttpClient:
    """用于替代 httpx.Client 的最小上下文管理器。"""

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.fixture
def parser() -> DashScopePayloadParser:
    """提供可复用的 DashScope 载荷解析器。"""
    return DashScopePayloadParser()


def test_payload_parser_extracts_and_merges_speaker_segments(parser: DashScopePayloadParser) -> None:
    """分段解析应合并相邻同说话人片段。"""
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

    assert len(merged) == 2
    assert merged[0].speaker_id == "s1"
    assert merged[0].text == "你好世界"
    assert merged[1].speaker_id == "s2"


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
    transcriber = DashScopeFileTranscriber(
        api_key="test-key",
        file_transcription_model="paraformer-v2",
        diarization_enabled=True,
        speaker_count=2,
        file_url_mode="temp",
        certifi_ca_file="/tmp/ca.pem",
        parser=parser,
    )
    responses = [
        {"output": {"task_id": "task-1", "task_status": "RUNNING"}},
        {"output": {"task_status": "RUNNING"}},
    ]

    with patch("services.dashscope.file_transcription.httpx.Client", return_value=_FakeHttpClient()):
        with patch.object(transcriber, "_request_dashscope_json", side_effect=lambda *args, **kwargs: responses.pop(0)):
            with patch("services.dashscope.file_transcription.time.monotonic", side_effect=[0, 181]):
                with patch("services.dashscope.file_transcription.time.sleep", return_value=None):
                    with pytest.raises(STTRecognitionError):
                        transcriber.run_file_transcription(file_url="oss://demo/audio.wav", language="zh")
