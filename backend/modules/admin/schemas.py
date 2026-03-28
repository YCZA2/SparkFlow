from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminBootstrapStatusResponse(BaseModel):
    has_admin: bool
    bootstrap_open: bool


class AdminUserListQuery(BaseModel):
    query: str | None = Field(None, description="按邮箱或昵称搜索")
    role: str | None = Field(None, description="角色筛选：user 或 admin")
    status: str | None = Field(None, description="状态筛选：active 或 inactive")


class AdminUserSummary(BaseModel):
    user_id: str
    email: str | None = None
    nickname: str | None = None
    role: str
    status: str
    created_at: datetime | None = None
    last_login_at: datetime | None = None
    active_session_count: int = 0


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="密码至少 8 位")
    nickname: str | None = Field(None, description="用户昵称")
    role: str = Field("user", description="角色：user 或 admin")


class UpdateUserRequest(BaseModel):
    nickname: str | None = Field(None, description="用户昵称")
    role: str | None = Field(None, description="角色：user 或 admin")
    status: str | None = Field(None, description="状态：active 或 inactive")


class ResetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=8, description="新密码至少 8 位")
