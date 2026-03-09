"""Dify 客户端测试。"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from core.exceptions import ServiceUnavailableError, ValidationError
from modules.agent.dify_client import DifyClient


@pytest.mark.asyncio
async def test_submit_workflow_run_success() -> None:
    """提交工作流成功时应正确解析返回值。"""
    client = DifyClient(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(
            request=AsyncMock(
                return_value=httpx.Response(
                    200,
                    json={"data": {"id": "run-1", "workflow_id": "wf-1", "status": "running", "outputs": {}}},
                )
            )
        ),
    )

    result = await client.submit_workflow_run(inputs={"topic": "定位"}, user="u1")
    assert result.run_id == "run-1"
    assert result.workflow_id == "wf-1"
    assert result.status == "running"


@pytest.mark.asyncio
async def test_get_workflow_run_raises_validation_for_4xx() -> None:
    """4xx 响应应被映射为业务校验错误。"""
    client = DifyClient(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(request=AsyncMock(return_value=httpx.Response(400, json={"message": "bad request"}))),
    )

    with pytest.raises(ValidationError):
        await client.get_workflow_run(run_id="run-1")


@pytest.mark.asyncio
async def test_get_workflow_run_raises_service_unavailable_for_5xx() -> None:
    """5xx 响应应被映射为上游服务不可用。"""
    client = DifyClient(
        base_url="https://dify.example.com/v1",
        api_key="test-key",
        http_client=AsyncMock(request=AsyncMock(return_value=httpx.Response(503, json={"message": "unavailable"}))),
    )

    with pytest.raises(ServiceUnavailableError):
        await client.get_workflow_run(run_id="run-1")
