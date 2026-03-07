from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core import success_response
from core.auth import get_current_user

from .application import AuthUseCase

router = APIRouter(prefix="/api/auth", tags=["auth"])
use_case = AuthUseCase()


class TokenRequest(BaseModel):
    username: str | None = None
    password: str | None = None


@router.post("/token")
async def create_token(_: TokenRequest | None = None):
    return success_response(data=use_case.issue_test_token(), message="测试用户令牌创建成功")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return success_response(
        data={"user_id": current_user["user_id"], "role": current_user["role"]},
        message="用户信息获取成功",
    )


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    return success_response(
        data=use_case.refresh_token(user_id=current_user["user_id"], role=current_user["role"]),
        message="令牌刷新成功",
    )
