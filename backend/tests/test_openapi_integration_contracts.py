"""依赖数据库的 OpenAPI 合同测试。"""

from __future__ import annotations

import pytest
import schemathesis

from main import create_app
from models import Base, User, engine
from modules.auth.application import TEST_USER_EMAIL, TEST_USER_ID, TEST_USER_PASSWORD
from modules.auth.password_service import hash_password

schemathesis.experimental.OPEN_API_3_1.enable()

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def prepare_database():
    """为 OpenAPI 合同测试准备最小数据库结构与测试用户。"""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(
            User.__table__.insert().values(
                id=TEST_USER_ID,
                role="user",
                nickname="测试用户",
                email=TEST_USER_EMAIL,
                password_hash=hash_password(TEST_USER_PASSWORD),
            )
        )
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def api_schema():
    """加载包含真实启动副作用的 OpenAPI schema。"""
    return schemathesis.openapi.from_asgi("/openapi.json", create_app(enable_runtime_side_effects=False))


def test_auth_token_openapi_contract_smoke(api_schema) -> None:
    """认证入口应满足 OpenAPI 中声明的最小契约。"""
    operation = api_schema["/api/auth/token"]["POST"]
    case = operation.make_case()
    response = case.call()
    case.validate_response(response)


def test_auth_register_openapi_contract_smoke(api_schema) -> None:
    """邮箱注册入口应满足 OpenAPI 中声明的最小契约。"""
    operation = api_schema["/api/auth/register"]["POST"]
    case = operation.make_case(
        body={
            "email": "contracttest@example.com",
            "password": "testpass123",
            "device_id": "test-device",
        }
    )
    response = case.call()
    case.validate_response(response)


def test_auth_login_openapi_contract_smoke(api_schema) -> None:
    """邮箱密码登录入口应满足 OpenAPI 中声明的最小契约。"""
    # 先注册再登录，确保用户存在
    register_operation = api_schema["/api/auth/register"]["POST"]
    register_case = register_operation.make_case(
        body={
            "email": "logincontract@example.com",
            "password": "testpass123",
            "device_id": "test-device-reg",
        }
    )
    register_case.call()

    operation = api_schema["/api/auth/login"]["POST"]
    case = operation.make_case(
        body={
            "email": "logincontract@example.com",
            "password": "testpass123",
            "device_id": "test-device",
        }
    )
    response = case.call()
    case.validate_response(response)
