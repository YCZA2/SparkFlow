from __future__ import annotations

from pydantic import BaseModel


class TokenRequest(BaseModel):
    username: str | None = None
    password: str | None = None


class TokenPayload(BaseModel):
    access_token: str
    token_type: str


class CurrentUserResponse(BaseModel):
    user_id: str
    role: str
