"""无数据库应用 smoke 测试。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_root_and_head_health_endpoints(stateless_client) -> None:
    """根路径和健康检查应在无数据库模式下正常返回。"""
    root_response = await stateless_client.get("/")
    assert root_response.status_code == 200
    assert root_response.json()["data"]["status"] == "ok"
    assert root_response.headers["X-Request-Id"]

    root_head_response = await stateless_client.head("/")
    assert root_head_response.status_code == 200
    assert root_head_response.text == ""

    health_head_response = await stateless_client.head("/health")
    assert health_head_response.status_code == 200
    assert health_head_response.text == ""


@pytest.mark.asyncio
async def test_request_id_header_is_echoed(stateless_client) -> None:
    """显式传入的 request id 应被原样透传回响应头。"""
    response = await stateless_client.get("/", headers={"x-request-id": "req-smoke-001"})
    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == "req-smoke-001"


@pytest.mark.asyncio
async def test_health_endpoint_maps_provider_statuses(stateless_app, stateless_client) -> None:
    """健康检查应正确映射 provider 可用、不可用和异常分支。"""
    stateless_app.state.container.llm_provider = SimpleNamespace(health_check=AsyncMock(return_value=True))
    stateless_app.state.container.stt_provider = SimpleNamespace(health_check=AsyncMock(return_value=False))
    stateless_app.state.container.vector_store = SimpleNamespace(health_check=AsyncMock(side_effect=RuntimeError("vector boom")))

    response = await stateless_client.get("/health")
    payload = response.json()["data"]

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["services"]["llm"] == "available"
    assert payload["services"]["stt"] == "unavailable"
    assert payload["services"]["vector_db"] == "error: vector boom"
