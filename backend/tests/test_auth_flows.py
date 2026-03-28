"""认证链路集成测试。"""

from __future__ import annotations

import pytest
from models import User
from main import ensure_local_test_user
from modules.auth.application import TEST_USER_ID

from tests.flow_helpers import _auth_headers

pytestmark = pytest.mark.integration


async def _bootstrap_admin(async_client, *, email: str = "admin@sparkflow.dev", password: str = "testpass123") -> dict:
    """初始化首个管理员并返回带鉴权的请求头。"""
    response = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "device_id": "admin-device", "nickname": "系统管理员"},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
    """首个管理员初始化后应支持 me、refresh 和 logout 的完整链路。"""
    register_response = await async_client.post(
        "/api/auth/register",
        json={"email": "flowtest@example.com", "password": "testpass123", "device_id": "device-a"},
    )
    assert register_response.status_code == 200
    payload = register_response.json()["data"]
    assert payload["user"]["email"] == "flowtest@example.com"
    assert payload["user"]["role"] == "admin"
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
async def test_register_is_closed_after_first_admin_initialized(async_client) -> None:
    """系统已有管理员后应拒绝新的公开注册请求。"""
    await _bootstrap_admin(async_client)

    second_register = await async_client.post(
        "/api/auth/register",
        json={"email": "another@example.com", "password": "testpass123", "device_id": "device-b"},
    )
    assert second_register.status_code == 422
    assert "公开注册已关闭" in second_register.json()["error"]["message"]


@pytest.mark.asyncio
async def test_admin_management_flow_supports_search_filters_force_logout_and_guards(async_client) -> None:
    """管理员后台应支持筛选、强制下线和关键安全保护。"""
    admin_headers = await _bootstrap_admin(async_client)

    bootstrap_status = await async_client.get("/api/admin/bootstrap-status")
    assert bootstrap_status.status_code == 200
    assert bootstrap_status.json()["data"] == {"has_admin": True, "bootstrap_open": False}

    create_user = await async_client.post(
        "/api/admin/users",
        json={
            "email": "member@example.com",
            "password": "testpass123",
            "nickname": "成员A",
            "role": "user",
        },
        headers=admin_headers,
    )
    assert create_user.status_code == 200
    user_id = create_user.json()["data"]["user_id"]

    user_login = await async_client.post(
        "/api/auth/login",
        json={"email": "member@example.com", "password": "testpass123", "device_id": "member-device"},
    )
    assert user_login.status_code == 200
    user_token = user_login.json()["data"]["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    list_response = await async_client.get("/api/admin/users?query=member&role=user&status=active", headers=admin_headers)
    assert list_response.status_code == 200
    users = list_response.json()["data"]
    assert len(users) == 1
    assert users[0]["email"] == "member@example.com"
    assert users[0]["active_session_count"] == 1

    non_admin_response = await async_client.get("/api/admin/users", headers=user_headers)
    assert non_admin_response.status_code == 403
    assert non_admin_response.json()["error"]["code"] == "PERMISSION_DENIED"

    force_logout = await async_client.post(f"/api/admin/users/{user_id}/force-logout", headers=admin_headers)
    assert force_logout.status_code == 200

    invalidated_me = await async_client.get("/api/auth/me", headers=user_headers)
    assert invalidated_me.status_code == 401
    assert "设备会话已失效" in invalidated_me.json()["error"]["message"]

    disable_user = await async_client.patch(
        f"/api/admin/users/{user_id}",
        json={"status": "inactive"},
        headers=admin_headers,
    )
    assert disable_user.status_code == 200

    disabled_login = await async_client.post(
        "/api/auth/login",
        json={"email": "member@example.com", "password": "testpass123", "device_id": "member-device-2"},
    )
    assert disabled_login.status_code == 401
    assert "账号不可用" in disabled_login.json()["error"]["message"]

    admin_me = await async_client.get("/api/auth/me", headers=admin_headers)
    admin_user_id = admin_me.json()["data"]["user_id"]

    cannot_demote_last_admin = await async_client.patch(
        f"/api/admin/users/{admin_user_id}",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert cannot_demote_last_admin.status_code == 422
    assert "最后一个管理员" in cannot_demote_last_admin.json()["error"]["message"]

    cannot_disable_last_admin = await async_client.patch(
        f"/api/admin/users/{admin_user_id}",
        json={"status": "inactive"},
        headers=admin_headers,
    )
    assert cannot_disable_last_admin.status_code == 422
    assert "最后一个可用管理员" in cannot_disable_last_admin.json()["error"]["message"]

    cannot_delete_self = await async_client.delete(f"/api/admin/users/{admin_user_id}", headers=admin_headers)
    assert cannot_delete_self.status_code == 422


@pytest.mark.asyncio
async def test_cannot_delete_or_demote_last_admin_even_with_multiple_admin_operations(async_client) -> None:
    """最后一个管理员不应被删除或降级。"""
    admin_headers = await _bootstrap_admin(async_client)
    me_response = await async_client.get("/api/auth/me", headers=admin_headers)
    admin_user_id = me_response.json()["data"]["user_id"]

    delete_response = await async_client.delete(f"/api/admin/users/{admin_user_id}", headers=admin_headers)
    assert delete_response.status_code == 422
    assert "不能删除当前登录账号" in delete_response.json()["error"]["message"]

    demote_response = await async_client.patch(
        f"/api/admin/users/{admin_user_id}",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert demote_response.status_code == 422
    assert "最后一个管理员" in demote_response.json()["error"]["message"]


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
