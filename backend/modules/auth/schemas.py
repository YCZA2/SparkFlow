from __future__ import annotations

from pydantic import BaseModel, Field


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
    phone_country_code: str = "+86"
    phone_number: str | None = None
    status: str = "active"
    device_id: str | None = None
    session_version: int | None = None


class CurrentUserResponse(BaseModel):
    user_id: str
    role: str
    nickname: str | None = None
    phone_country_code: str = "+86"
    phone_number: str | None = None
    status: str = "active"
    device_id: str | None = None
    session_version: int | None = None


class VerificationCodeRequest(BaseModel):
    phone_number: str = Field(..., min_length=11, max_length=11, description="中国大陆手机号")
    phone_country_code: str = Field("+86", description="手机号国家码")


class VerificationCodeResponse(BaseModel):
    sent: bool
    resend_after_seconds: int
    expires_in_seconds: int
    debug_code: str | None = None


class PhoneLoginRequest(BaseModel):
    phone_number: str = Field(..., min_length=11, max_length=11, description="中国大陆手机号")
    verification_code: str = Field(..., min_length=4, max_length=8, description="短信验证码")
    phone_country_code: str = Field("+86", description="手机号国家码")
    device_id: str = Field("sparkflow-default-device", description="设备唯一标识")


class LoginResponse(TokenPayload):
    user: AuthenticatedUserPayload
