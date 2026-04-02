from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core import ResponseModel, settings, success_response
from core.auth import get_current_user
from core.exceptions import PermissionDeniedError
from modules.shared.infrastructure.container import get_db_session

from .application import AuthUseCase
from .schemas import (
    CurrentUserResponse,
    EmailLoginRequest,
    EmailRegisterRequest,
    LoginResponse,
    TokenPayload,
    TokenRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
use_case = AuthUseCase()


@router.post(
    "/register",
    response_model=ResponseModel[LoginResponse],
    summary="邮箱注册",
    description="使用邮箱和密码注册新账号，注册成功后自动完成登录并创建设备会话。",
)
async def register(
    payload: EmailRegisterRequest,
    db: Session = Depends(get_db_session),
):
    # 付费场景下关闭开放注册，仅允许管理员手动创建用户
    if not settings.ENABLE_PUBLIC_REGISTRATION:
        raise PermissionDeniedError("开放注册已关闭，请联系管理员获取账号")
    return success_response(
        data=use_case.register_with_email(
            db=db,
            email=payload.email,
            password=payload.password,
            device_id=payload.device_id,
            nickname=payload.nickname,
        ),
        message="注册成功",
    )


@router.post(
    "/login",
    response_model=ResponseModel[LoginResponse],
    summary="邮箱密码登录",
    description="使用邮箱和密码完成登录，并创建当前设备会话。",
)
async def login(
    payload: EmailLoginRequest,
    db: Session = Depends(get_db_session),
):
    return success_response(
        data=use_case.login_with_email_password(
            db=db,
            email=payload.email,
            password=payload.password,
            device_id=payload.device_id,
        ),
        message="登录成功",
    )


@router.post(
    "/token",
    response_model=ResponseModel[TokenPayload],
    summary="签发测试令牌",
    description="仅本地开发联调使用的测试用户令牌入口；正式环境应关闭。",
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
    description="解析当前访问令牌并返回正式用户资料。",
)
async def get_me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return success_response(
        data=use_case.build_current_user_response(db=db, current_user=current_user),
        message="用户信息获取成功",
    )


@router.post(
    "/refresh",
    response_model=ResponseModel[TokenPayload],
    summary="刷新访问令牌",
    description="基于当前已认证用户签发新的访问令牌。",
)
async def refresh_token(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return success_response(
        data=use_case.refresh_token(
            db=db,
            user_id=current_user["user_id"],
            role=current_user["role"],
            device_id=current_user.get("device_id"),
            session_version=current_user.get("session_version"),
        ),
        message="令牌刷新成功",
    )


@router.post(
    "/logout",
    response_model=ResponseModel[None],
    summary="退出当前设备登录",
    description="撤销当前设备会话，使该设备上的访问令牌立即失效。",
)
async def logout(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db_session)):
    use_case.logout(
        db=db,
        user_id=current_user["user_id"],
        device_id=current_user.get("device_id"),
    )
    return success_response(data=None, message="已退出登录")
