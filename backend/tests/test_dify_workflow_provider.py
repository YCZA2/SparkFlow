"""Dify workflow provider adapter 测试。"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

from modules.shared.ports import (
    WorkflowProviderInvalidResponseError,
    WorkflowProviderRequestError,
    WorkflowProviderTimeoutError,
    WorkflowProviderUpstreamError,
)
from services.dify_workflow_provider import DifyWorkflowProvider


class StreamingHttpClientStub:
    """提供 Dify streaming 提交测试所需的最小 http client 替身。"""

    def __init__(self, *, stream_response: httpx.Response | Exception, request_response: httpx.Response | Exception | None = None) -> None:
        self._stream_response = stream_response
        self.request = AsyncMock()
        self.send = AsyncMock()
        if request_response is not None:
            if isinstance(request_response, Exception):
                self.request.side_effect = request_response
            else:
                self.request.return_value = request_response
        if isinstance(stream_response, Exception):
            self.send.side_effect = stream_response
        else:
            self.send.return_value = stream_response
        self.stream_calls: list[dict[str, Any]] = []

    def build_request(self, method: str, url: str, **kwargs: Any):
        self.stream_calls.append({"method": method, "url": url, "kwargs": kwargs})
        return {"method": method, "url": url, "kwargs": kwargs}

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_submit_run_success_reads_streaming_started_event() -> None:
    """提交运行时应从 streaming 首包拿到 provider 句柄。"""
    response = httpx.Response(
        200,
        headers={"Content-Type": "text/event-stream"},
        content=(
            b'event: ping\n\n'
            b'data: {"event":"workflow_started","workflow_run_id":"run-1","task_id":"task-1","data":{"id":"run-1","workflow_id":"wf-1","status":"running"}}\n\n'
        ),
    )
    http_client = StreamingHttpClientStub(stream_response=response)
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=http_client,  # type: ignore[arg-type]
    )

    result = await provider.submit_run(
        inputs={"mode": "mode_a", "selected_fragments": [{"id": "f1"}], "query_hint": None},
        user_id="u1",
    )

    stream_call = http_client.stream_calls[0]
    assert stream_call["method"] == "POST"
    assert stream_call["url"] == "https://dify.example.com/v1/workflows/run"
    payload = stream_call["kwargs"]["json"]
    assert payload["response_mode"] == "streaming"
    assert payload["inputs"]["selected_fragments"] == '[{"id": "f1"}]'
    assert payload["inputs"]["query_hint"] == ""
    assert result.run_id == "run-1"
    assert result.status == "running"
    assert result.provider_workflow_id == "wf-1"
    assert result.provider_task_id == "task-1"
    assert result.outputs == {}


@pytest.mark.asyncio
async def test_submit_run_raises_invalid_response_when_streaming_run_id_missing() -> None:
    """streaming 首包缺少 workflow_run_id 时应视为无效返回结构。"""
    response = httpx.Response(
        200,
        headers={"Content-Type": "text/event-stream"},
        content=b'data: {"event":"workflow_started","task_id":"task-1","data":{"workflow_id":"wf-1","status":"running"}}\n\n',
    )
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(stream_response=response),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderInvalidResponseError):
        await provider.submit_run(inputs={"mode": "mode_a"}, user_id="u1")


@pytest.mark.asyncio
async def test_submit_run_raises_request_error_for_streaming_4xx() -> None:
    """streaming 提交遇到 4xx 时应映射为 provider 请求错误。"""
    response = httpx.Response(400, json={"message": "bad request"})
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(stream_response=response),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderRequestError):
        await provider.submit_run(inputs={"mode": "mode_a"}, user_id="u1")


@pytest.mark.asyncio
async def test_submit_run_raises_timeout_error_for_streaming_timeout() -> None:
    """streaming 提交超时应映射为 provider 暂时不可用。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(stream_response=httpx.TimeoutException("timeout")),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderTimeoutError):
        await provider.submit_run(inputs={"mode": "mode_a"}, user_id="u1")


@pytest.mark.asyncio
async def test_get_run_maps_status_to_internal_semantics() -> None:
    """查询运行时应把 Dify 状态收敛到统一状态枚举。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(
            stream_response=httpx.Response(200, content=b""),
            request_response=httpx.Response(
                200,
                json={
                    "data": {
                        "id": "run-1",
                        "workflow_id": "wf-1",
                        "task_id": "task-1",
                        "status": "completed",
                        "outputs": {"draft": "ok"},
                    }
                },
            ),
        ),  # type: ignore[arg-type]
    )

    result = await provider.get_run(run_id="run-1")

    assert result.status == "succeeded"
    assert result.outputs["draft"] == "ok"


@pytest.mark.asyncio
async def test_get_run_raises_request_error_for_4xx() -> None:
    """4xx 响应应映射为 provider 请求错误。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(
            stream_response=httpx.Response(200, content=b""),
            request_response=httpx.Response(400, json={"message": "bad request"}),
        ),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderRequestError):
        await provider.get_run(run_id="run-1")


@pytest.mark.asyncio
async def test_get_run_raises_upstream_error_for_5xx() -> None:
    """5xx 响应应映射为上游服务失败。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(
            stream_response=httpx.Response(200, content=b""),
            request_response=httpx.Response(503, json={"message": "unavailable"}),
        ),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderUpstreamError):
        await provider.get_run(run_id="run-1")


@pytest.mark.asyncio
async def test_get_run_raises_timeout_error_for_request_timeout() -> None:
    """查询超时应映射为 provider 暂时不可用。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=StreamingHttpClientStub(
            stream_response=httpx.Response(200, content=b""),
            request_response=httpx.TimeoutException("timeout"),
        ),  # type: ignore[arg-type]
    )

    with pytest.raises(WorkflowProviderTimeoutError):
        await provider.get_run(run_id="run-1")
