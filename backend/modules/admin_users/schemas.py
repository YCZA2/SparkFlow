"""管理员用户管理模块的请求/响应 Pydantic 模型。"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------

class UserListQuery(BaseModel):
    """用户列表查询参数，支持分页和多维度过滤。"""
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)
    role: Optional[str] = None          # 'user' | 'creator' | 'admin'
    status: Optional[str] = None        # 'active' | 'deleted'
    search: Optional[str] = None        # email 或 nickname 模糊匹配
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None


class UserUpdateRequest(BaseModel):
    """更新用户信息的请求体，所有字段均可选。"""
    nickname: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    storage_quota: Optional[int] = Field(None, ge=0)


class PasswordResetRequest(BaseModel):
    """管理员重置用户密码的请求体。"""
    new_password: str = Field(..., min_length=8)


class BatchOperationRequest(BaseModel):
    """批量操作请求体：对指定用户列表执行统一动作。"""
    user_ids: List[str] = Field(..., min_length=1, max_length=100)
    action: Literal["activate", "deactivate", "delete"]


# ---------------------------------------------------------------------------
# 响应模型
# ---------------------------------------------------------------------------

class UserStatsItem(BaseModel):
    """用户内容统计子对象，嵌入用户详情响应。"""
    fragment_count: int
    script_count: int
    knowledge_doc_count: int
    last_activity_at: Optional[datetime]


class UserSummaryItem(BaseModel):
    """用户列表页的轻量摘要条目。"""
    id: str
    role: str
    nickname: Optional[str]
    email: Optional[str]
    status: str
    storage_quota: int
    created_at: datetime
    last_login_at: Optional[datetime]


class UserDetailResponse(UserSummaryItem):
    """用户详情页，在摘要基础上附加内容统计。"""
    stats: UserStatsItem


class UserListResponse(BaseModel):
    """分页用户列表响应。"""
    items: List[UserSummaryItem]
    total: int
    limit: int
    offset: int


class DeviceSessionItem(BaseModel):
    """单条设备会话信息。"""
    id: str
    device_id: str
    session_version: int
    status: str
    created_at: datetime
    last_seen_at: datetime
    revoked_at: Optional[datetime]


class DeviceSessionListResponse(BaseModel):
    """用户设备会话列表响应。"""
    items: List[DeviceSessionItem]
    total: int


class SystemStatsResponse(BaseModel):
    """系统级用户统计概览。"""
    total_users: int
    active_users: int
    new_users_today: int


class BatchOperationResponse(BaseModel):
    """批量操作执行结果。"""
    affected: int
    action: str
