"""OpenAPI Schemathesis 合同测试。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import schemathesis

from main import create_app

schemathesis.experimental.OPEN_API_3_1.enable()


@pytest.fixture
def api_schema():
    """直接从应用工厂加载 OpenAPI schema，避免依赖数据库 fixture。"""
    app = create_app(enable_runtime_side_effects=False)
    app.state.container.llm_provider = SimpleNamespace(health_check=AsyncMock(return_value=True))
    app.state.container.stt_provider = SimpleNamespace(health_check=AsyncMock(return_value=True))
    app.state.container.vector_store = SimpleNamespace(health_check=AsyncMock(return_value=True))
    return schemathesis.openapi.from_asgi("/openapi.json", app)

@pytest.mark.parametrize(("path", "method"), [("/", "GET"), ("/health", "GET")])
def test_public_openapi_contract_smoke(api_schema, path: str, method: str) -> None:
    """公开接口应满足 OpenAPI 中声明的最小契约。"""
    operation = api_schema[path][method]
    case = operation.make_case()
    response = case.call()
    case.validate_response(response)
