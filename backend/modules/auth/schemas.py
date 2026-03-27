from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class TokenRequest(BaseModel):
    device_id: str = Field("sparkflow-default-device", description="设备唯一标识")


class TokenPayload(BaseModel):
    access_token: str
    token_type: str
    device_id: str
    session_version: int


class AuthenticatedUserPayload(BaseModel):
    user_id: str
    role: str
    nickname: str | None = None
    email: str | None = None
    status: str = "active"
    device_id: str | None = None
    session_version: int | None = None


class CurrentUserResponse(AuthenticatedUserPayload):
    pass


class EmailRegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")
    password: str = Field(..., min_length=8, description="登录密码（至少8位）")
    nickname: str | None = Field(None, description="用户昵称（可选）")
    device_id: str = Field("sparkflow-default-device", description="设备唯一标识")
    role: str | None = Field(None, description="角色（user 或 creator，仅首次注册允许 creator）")


class EmailLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")
    password: str = Field(..., description="登录密码")
    device_id: str = Field("sparkflow-default-device", description="设备唯一标识")


class LoginResponse(TokenPayload):
    user: AuthenticatedUserPayload
