from __future__ import annotations

from pydantic import BaseModel, Field


class TokenRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    device_id: str = Field("sparkflow-default-device", description="设备唯一标识")


class TokenPayload(BaseModel):
    access_token: str
    token_type: str
    device_id: str
    session_version: int


class CurrentUserResponse(BaseModel):
    user_id: str
    role: str
    device_id: str | None = None
    session_version: int | None = None
