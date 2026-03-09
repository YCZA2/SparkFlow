"""OpenAPI Schemathesis 合同测试。"""

from __future__ import annotations

import pytest
import schemathesis

from main import create_app

schemathesis.experimental.OPEN_API_3_1.enable()


@pytest.fixture
def api_schema():
    """直接从应用工厂加载 OpenAPI schema，避免依赖数据库 fixture。"""
    return schemathesis.openapi.from_asgi("/openapi.json", create_app())


@pytest.mark.parametrize(("path", "method"), [("/", "GET"), ("/health", "GET"), ("/api/auth/token", "POST")])
def test_public_openapi_contract_smoke(api_schema, path: str, method: str) -> None:
    """公开接口应满足 OpenAPI 中声明的最小契约。"""
    operation = api_schema[path][method]
    case = operation.make_case()
    response = case.call()
    case.validate_response(response)
