"""管理员用户管理集成测试。"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from core.auth import create_access_token
from models import User
from modules.auth.application import TEST_USER_ID

pytestmark = pytest.mark.integration

ADMIN_USER_ID = "admin-test-001"
OTHER_USER_ID = "other-user-001"


@pytest_asyncio.fixture
async def admin_headers(db_session_factory) -> dict[str, str]:
    """创建 admin 角色用户并签发不含 device_id 的 JWT（绕过设备会话校验）。"""
    with db_session_factory() as db:
        db.add(User(id=ADMIN_USER_ID, role="admin", nickname="超级管理员", status="active",
                    email="admin@sparkflow.dev"))
        db.commit()
    token = create_access_token(user_id=ADMIN_USER_ID, role="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def other_user(db_session_factory) -> str:
    """创建普通测试用户，返回其 user_id。"""
    with db_session_factory() as db:
        db.add(User(id=OTHER_USER_ID, role="user", nickname="普通用户", status="active",
                    email="other@sparkflow.dev"))
        db.commit()
    return OTHER_USER_ID


# ---------------------------------------------------------------------------
# 权限校验
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_gets_401(async_client: AsyncClient):
    """未携带 token 的请求应返回 401。"""
    response = await async_client.get("/api/admin/users")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_gets_403(async_client: AsyncClient, auth_headers_factory):
    """普通用户（role=user）访问管理端点应返回 403。"""
    headers = await auth_headers_factory(async_client)
    response = await async_client.get("/api/admin/users", headers=headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# 系统统计
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_system_stats_returns_counts(async_client: AsyncClient, admin_headers, other_user):
    """系统统计接口应返回正确的用户数量。"""
    response = await async_client.get("/api/admin/stats", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    # admin + test_user + other_user = 3 个用户
    assert data["total_users"] >= 3
    assert data["active_users"] >= 2
    assert "new_users_today" in data


# ---------------------------------------------------------------------------
# 用户列表
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_list_users(async_client: AsyncClient, admin_headers, other_user):
    """管理员可获取用户列表并支持分页。"""
    response = await async_client.get("/api/admin/users", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert "items" in data
    assert data["total"] >= 2
    assert data["limit"] == 20
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_admin_can_create_user(async_client: AsyncClient, admin_headers):
    """管理员可手动创建用户。"""
    response = await async_client.post(
        "/api/admin/users",
        json={
            "email": "created@sparkflow.dev",
            "password": "createdpass123",
            "nickname": "新建用户",
            "role": "user",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["email"] == "created@sparkflow.dev"
    assert data["nickname"] == "新建用户"
    assert data["role"] == "user"


@pytest.mark.asyncio
async def test_admin_can_filter_users_by_role(async_client: AsyncClient, admin_headers, other_user):
    """管理员可按 role 过滤用户列表。"""
    response = await async_client.get("/api/admin/users?role=admin", headers=admin_headers)
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert all(item["role"] == "admin" for item in items)


@pytest.mark.asyncio
async def test_admin_can_search_users_by_email(async_client: AsyncClient, admin_headers, other_user):
    """管理员可通过邮箱关键词搜索用户。"""
    response = await async_client.get("/api/admin/users?search=other%40sparkflow", headers=admin_headers)
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert any("other@sparkflow.dev" in (item.get("email") or "") for item in items)


# ---------------------------------------------------------------------------
# 用户详情
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_get_user_detail(async_client: AsyncClient, admin_headers, other_user):
    """管理员可获取用户详情，响应中包含统计字段。"""
    response = await async_client.get(f"/api/admin/users/{OTHER_USER_ID}", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == OTHER_USER_ID
    assert "stats" in data
    assert "fragment_count" in data["stats"]
    assert "script_count" in data["stats"]
    assert "knowledge_doc_count" in data["stats"]


@pytest.mark.asyncio
async def test_get_nonexistent_user_returns_404(async_client: AsyncClient, admin_headers):
    """查询不存在的用户应返回 404。"""
    response = await async_client.get("/api/admin/users/does-not-exist", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 修改用户
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_update_user_nickname(async_client: AsyncClient, admin_headers, other_user):
    """管理员可修改用户昵称。"""
    response = await async_client.patch(
        f"/api/admin/users/{OTHER_USER_ID}",
        json={"nickname": "新昵称"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["nickname"] == "新昵称"


@pytest.mark.asyncio
async def test_admin_can_change_user_role(async_client: AsyncClient, admin_headers, other_user):
    """管理员可修改用户角色。"""
    response = await async_client.patch(
        f"/api/admin/users/{OTHER_USER_ID}",
        json={"role": "creator"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "creator"


# ---------------------------------------------------------------------------
# 密码重置
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_reset_password(async_client: AsyncClient, admin_headers, other_user):
    """管理员重置密码后，用户可用新密码登录。"""
    # 重置密码
    reset_resp = await async_client.post(
        f"/api/admin/users/{OTHER_USER_ID}/reset-password",
        json={"new_password": "newpassword123"},
        headers=admin_headers,
    )
    assert reset_resp.status_code == 200

    # 用新密码登录验证
    login_resp = await async_client.post(
        "/api/auth/login",
        json={"email": "other@sparkflow.dev", "password": "newpassword123", "device_id": "test-device"},
    )
    assert login_resp.status_code == 200


# ---------------------------------------------------------------------------
# 设备会话管理
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_list_user_sessions(async_client: AsyncClient, admin_headers, other_user):
    """管理员可查看用户设备会话列表。"""
    response = await async_client.get(
        f"/api/admin/users/{OTHER_USER_ID}/sessions",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_admin_can_revoke_user_sessions(async_client: AsyncClient, admin_headers, other_user, db_session_factory):
    """管理员撤销用户会话后，active 状态会话应归零。"""
    from models import DeviceSession
    from models.utils import generate_uuid

    # 直接插入一条 active 会话
    with db_session_factory() as db:
        db.add(DeviceSession(
            id=generate_uuid(),
            user_id=OTHER_USER_ID,
            device_id="device-xyz",
            session_version=1,
            status="active",
        ))
        db.commit()

    # 撤销所有会话
    response = await async_client.delete(
        f"/api/admin/users/{OTHER_USER_ID}/sessions",
        headers=admin_headers,
    )
    assert response.status_code == 200

    # 验证所有会话已被撤销
    with db_session_factory() as db:
        active_count = db.query(DeviceSession).filter(
            DeviceSession.user_id == OTHER_USER_ID,
            DeviceSession.status == "active",
        ).count()
    assert active_count == 0


# ---------------------------------------------------------------------------
# 删除用户
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_soft_delete_user(async_client: AsyncClient, admin_headers, other_user):
    """管理员软删除用户后，status 应变为 'deleted'。"""
    response = await async_client.delete(
        f"/api/admin/users/{OTHER_USER_ID}",
        headers=admin_headers,
    )
    assert response.status_code == 200

    # 验证状态已变更
    detail_resp = await async_client.get(
        f"/api/admin/users/{OTHER_USER_ID}",
        headers=admin_headers,
    )
    assert detail_resp.json()["data"]["status"] == "deleted"


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(async_client: AsyncClient, admin_headers):
    """管理员不能删除自身账号，应返回 422。"""
    response = await async_client.delete(
        f"/api/admin/users/{ADMIN_USER_ID}",
        headers=admin_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 批量操作
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_batch_deactivate(async_client: AsyncClient, admin_headers, other_user):
    """管理员可批量停用用户。"""
    response = await async_client.post(
        "/api/admin/users/batch",
        json={"user_ids": [OTHER_USER_ID], "action": "deactivate"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["affected"] == 1
    assert data["action"] == "deactivate"

    # 验证状态变更
    detail_resp = await async_client.get(
        f"/api/admin/users/{OTHER_USER_ID}",
        headers=admin_headers,
    )
    assert detail_resp.json()["data"]["status"] == "inactive"


@pytest.mark.asyncio
async def test_batch_skips_self(async_client: AsyncClient, admin_headers):
    """批量操作跳过当前登录管理员自身，不计入 affected。"""
    response = await async_client.post(
        "/api/admin/users/batch",
        json={"user_ids": [ADMIN_USER_ID], "action": "deactivate"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["affected"] == 0
