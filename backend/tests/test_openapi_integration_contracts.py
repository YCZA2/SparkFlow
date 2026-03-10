"""依赖数据库的 OpenAPI 合同测试。"""

from __future__ import annotations

import pytest
import schemathesis

from main import create_app

schemathesis.experimental.OPEN_API_3_1.enable()

pytestmark = pytest.mark.integration


@pytest.fixture
def api_schema():
    """加载包含真实启动副作用的 OpenAPI schema。"""
    return schemathesis.openapi.from_asgi("/openapi.json", create_app())


def test_auth_token_openapi_contract_smoke(api_schema) -> None:
    """认证入口应满足 OpenAPI 中声明的最小契约。"""
    operation = api_schema["/api/auth/token"]["POST"]
    case = operation.make_case()
    response = case.call()
    case.validate_response(response)
