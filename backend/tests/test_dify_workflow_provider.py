"""Dify workflow provider adapter 测试。"""

from __future__ import annotations

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


@pytest.mark.asyncio
async def test_submit_run_success_serializes_structured_inputs() -> None:
    """提交运行时应把结构化上下文转换为 Dify 兼容输入。"""
    http_client = AsyncMock(
        request=AsyncMock(
            return_value=httpx.Response(
                200,
                json={"data": {"id": "run-1", "workflow_id": "wf-1", "status": "running", "outputs": {}}},
            )
        )
    )
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=http_client,
    )

    result = await provider.submit_run(
        inputs={"mode": "mode_a", "selected_fragments": [{"id": "f1"}], "query_hint": None},
        user_id="u1",
    )

    request_call = http_client.request.await_args
    assert request_call.args[:2] == ("POST", "https://dify.example.com/v1/workflows/run")
    payload = request_call.kwargs["json"]
    assert payload["inputs"]["selected_fragments"] == '[{"id": "f1"}]'
    assert payload["inputs"]["query_hint"] == ""
    assert result.run_id == "run-1"
    assert result.provider_workflow_id == "wf-1"
    assert result.status == "running"


@pytest.mark.asyncio
async def test_get_run_maps_status_to_internal_semantics() -> None:
    """查询运行时应把 Dify 状态收敛到统一状态枚举。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(
            request=AsyncMock(
                return_value=httpx.Response(
                    200,
                    json={"data": {"id": "run-1", "workflow_id": "wf-1", "status": "completed", "outputs": {"draft": "ok"}}},
                )
            )
        ),
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
        http_client=AsyncMock(request=AsyncMock(return_value=httpx.Response(400, json={"message": "bad request"}))),
    )

    with pytest.raises(WorkflowProviderRequestError):
        await provider.get_run(run_id="run-1")


@pytest.mark.asyncio
async def test_get_run_raises_upstream_error_for_5xx() -> None:
    """5xx 响应应映射为上游服务失败。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(request=AsyncMock(return_value=httpx.Response(503, json={"message": "unavailable"}))),
    )

    with pytest.raises(WorkflowProviderUpstreamError):
        await provider.get_run(run_id="run-1")


@pytest.mark.asyncio
async def test_get_run_raises_timeout_error_for_request_timeout() -> None:
    """超时应映射为 provider 暂时不可用。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(request=AsyncMock(side_effect=httpx.TimeoutException("timeout"))),
    )

    with pytest.raises(WorkflowProviderTimeoutError):
        await provider.get_run(run_id="run-1")


@pytest.mark.asyncio
async def test_submit_run_raises_invalid_response_when_run_id_missing() -> None:
    """2xx 但缺少运行 ID 时应视为无效返回结构。"""
    provider = DifyWorkflowProvider(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(request=AsyncMock(return_value=httpx.Response(200, json={"data": {"status": "running", "outputs": {}}}))),
    )

    with pytest.raises(WorkflowProviderInvalidResponseError):
        await provider.submit_run(inputs={"mode": "mode_a"}, user_id="u1")
