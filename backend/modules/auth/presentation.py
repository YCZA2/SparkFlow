from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import get_db_session

from .application import AuthUseCase
from .schemas import CurrentUserResponse, TokenPayload, TokenRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])
use_case = AuthUseCase()

@router.post(
    "/token",
    response_model=ResponseModel[TokenPayload],
    summary="签发测试令牌",
    description="为本地开发和联调场景签发测试用户令牌。",
)
async def create_token(
    payload: TokenRequest | None = None,
    db: Session = Depends(get_db_session),
):
    request_payload = payload or TokenRequest()
    return success_response(
        data=use_case.issue_test_token(db=db, device_id=request_payload.device_id),
        message="测试用户令牌创建成功",
    )


@router.get(
    "/me",
    response_model=ResponseModel[CurrentUserResponse],
    summary="获取当前用户信息",
    description="解析当前访问令牌并返回用户 ID 与角色信息。",
)
async def get_me(current_user: dict = Depends(get_current_user)):
    return success_response(
        data=CurrentUserResponse(
            user_id=current_user["user_id"],
            role=current_user["role"],
            device_id=current_user.get("device_id"),
            session_version=current_user.get("session_version"),
        ),
        message="用户信息获取成功",
    )


@router.post(
    "/refresh",
    response_model=ResponseModel[TokenPayload],
    summary="刷新访问令牌",
    description="基于当前已认证用户签发新的访问令牌。",
)
async def refresh_token(current_user: dict = Depends(get_current_user)):
    return success_response(
        data=use_case.refresh_token(
            user_id=current_user["user_id"],
            role=current_user["role"],
            device_id=current_user.get("device_id"),
            session_version=current_user.get("session_version"),
        ),
        message="令牌刷新成功",
    )
