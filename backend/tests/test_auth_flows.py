"""认证链路集成测试。"""

from __future__ import annotations

import pytest
from models import User
from main import ensure_local_test_user
from modules.auth.application import TEST_USER_ID

from tests.flow_helpers import _auth_headers

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/auth/me", None),
        ("post", "/api/auth/refresh", {}),
        ("post", "/api/scripts/daily-push/trigger", None),
        ("get", "/api/knowledge", None),
        ("post", "/api/external-media/audio-imports", {"share_url": "https://v.douyin.com/test", "platform": "auto"}),
    ],
)
async def test_protected_routes_require_authentication(async_client, method: str, path: str, payload) -> None:
    """未认证请求应统一返回鉴权错误。"""
    request = getattr(async_client, method)
    if payload is None:
        response = await request(path)
    else:
        response = await request(path, json=payload)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION"


@pytest.mark.asyncio
async def test_auth_token_me_and_refresh(async_client, auth_headers_factory) -> None:
    """登录、获取当前用户和刷新令牌链路应正常工作。"""
    token_response = await async_client.post("/api/auth/token", json={})
    assert token_response.status_code == 200
    payload = token_response.json()["data"]
    assert payload["token_type"] == "bearer"

    headers = {"Authorization": f"Bearer {payload['access_token']}"}
    protected_response = await async_client.get("/api/auth/me", headers=headers)
    assert protected_response.status_code == 200
    assert protected_response.json()["data"]["user_id"] == TEST_USER_ID

    refresh_response = await async_client.post("/api/auth/refresh", headers=headers)
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()["data"]
    assert refreshed["token_type"] == "bearer"
    assert refreshed["access_token"]


@pytest.mark.asyncio
async def test_email_password_login_me_refresh_and_logout(async_client) -> None:
    """邮箱密码注册登录应支持 me、refresh 和 logout 的完整链路。"""
    register_response = await async_client.post(
        "/api/auth/register",
        json={"email": "flowtest@example.com", "password": "testpass123", "device_id": "device-a"},
    )
    assert register_response.status_code == 200
    payload = register_response.json()["data"]
    assert payload["user"]["email"] == "flowtest@example.com"
    assert payload["token_type"] == "bearer"

    login_response = await async_client.post(
        "/api/auth/login",
        json={"email": "flowtest@example.com", "password": "testpass123", "device_id": "device-a"},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()["data"]
    assert login_payload["user"]["email"] == "flowtest@example.com"

    headers = {"Authorization": f"Bearer {login_payload['access_token']}"}
    me_response = await async_client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["data"]["email"] == "flowtest@example.com"

    refresh_response = await async_client.post("/api/auth/refresh", headers=headers)
    assert refresh_response.status_code == 200
    refreshed_token = refresh_response.json()["data"]["access_token"]
    assert refreshed_token

    logout_response = await async_client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {refreshed_token}"},
    )
    assert logout_response.status_code == 200

    invalid_me_response = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {refreshed_token}"},
    )
    assert invalid_me_response.status_code == 401
    assert "设备会话已失效" in invalid_me_response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_auth_token_recreates_missing_test_user(async_client, db_session_factory) -> None:
    """签发测试令牌时应自动补齐缺失的测试用户。"""
    with db_session_factory() as db:
        db.query(User).filter(User.id == TEST_USER_ID).delete()
        db.commit()

    token_response = await async_client.post("/api/auth/token", json={})
    assert token_response.status_code == 200

    with db_session_factory() as db:
        test_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        assert test_user is not None
        assert test_user.nickname == "测试博主"
        assert test_user.role == "user"


def test_startup_hook_recreates_missing_test_user(db_session_factory, monkeypatch) -> None:
    """启动阶段应补齐测试用户，兼容旧 token 直接恢复场景。"""
    with db_session_factory() as db:
        db.query(User).filter(User.id == TEST_USER_ID).delete()
        db.commit()

    monkeypatch.setattr("main.SessionLocal", db_session_factory)
    ensure_local_test_user()

    with db_session_factory() as db:
        test_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        assert test_user is not None
        assert test_user.nickname == "测试博主"
