from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import get_db_session

from .application import AdminUseCase
from .schemas import (
    AdminBootstrapStatusResponse,
    AdminUserSummary,
    CreateUserRequest,
    ResetPasswordRequest,
    UpdateUserRequest,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
use_case = AdminUseCase()


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """限制后台接口只能由管理员访问。"""
    use_case.ensure_admin(current_user)
    return current_user


@router.get(
    "/bootstrap-status",
    response_model=ResponseModel[AdminBootstrapStatusResponse],
    summary="获取管理员初始化状态",
    description="公开返回系统是否已创建首个管理员，用于后台初始化页决策。",
)
async def get_bootstrap_status(db: Session = Depends(get_db_session)):
    return success_response(data=use_case.get_bootstrap_status(db=db))


@router.get(
    "/users",
    response_model=ResponseModel[list[AdminUserSummary]],
    summary="获取用户列表",
    description="管理员按关键字、角色、状态筛选用户列表，默认按创建时间倒序。",
)
async def list_users(
    query: str | None = Query(None, description="按邮箱或昵称搜索"),
    role: str | None = Query(None, description="角色筛选：user 或 admin"),
    status: str | None = Query(None, description="状态筛选：active 或 inactive"),
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_admin),
):
    return success_response(
        data=use_case.list_users(
            db=db,
            query=query,
            role=role,
            status=status,
        )
    )


@router.post(
    "/users",
    response_model=ResponseModel[AdminUserSummary],
    summary="创建用户",
    description="由管理员直接创建可登录的新用户账号。",
)
async def create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_admin),
):
    return success_response(
        data=use_case.create_user(
            db=db,
            email=payload.email,
            password=payload.password,
            nickname=payload.nickname,
            role=payload.role,
        ),
        message="用户创建成功",
    )


@router.patch(
    "/users/{user_id}",
    response_model=ResponseModel[AdminUserSummary],
    summary="更新用户",
    description="更新用户昵称、角色或状态，并保护最后一个管理员不被禁用或降级。",
)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_admin),
):
    return success_response(
        data=use_case.update_user(
            db=db,
            user_id=user_id,
            apply_nickname="nickname" in payload.model_fields_set,
            nickname=payload.nickname,
            role=payload.role,
            status=payload.status,
        ),
        message="更新成功",
    )


@router.post(
    "/users/{user_id}/reset-password",
    response_model=ResponseModel[None],
    summary="重置密码",
    description="管理员为指定用户设置新密码，不会自动创建新会话。",
)
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_admin),
):
    use_case.reset_password(db=db, user_id=user_id, password=payload.password)
    return success_response(data=None, message="密码已重置")


@router.post(
    "/users/{user_id}/force-logout",
    response_model=ResponseModel[None],
    summary="强制下线用户",
    description="撤销指定用户的所有活跃设备会话，让旧 token 在下次请求时失效。",
)
async def force_logout(
    user_id: str,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_admin),
):
    use_case.force_logout_user(db=db, user_id=user_id)
    return success_response(data=None, message="用户已强制下线")


@router.delete(
    "/users/{user_id}",
    response_model=ResponseModel[None],
    summary="删除用户",
    description="永久删除指定用户及其关联数据，不允许删除自己或最后一个管理员。",
)
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db_session),
    current_user: dict = Depends(require_admin),
):
    use_case.delete_user(
        db=db,
        user_id=user_id,
        current_user_id=current_user["user_id"],
    )
    return success_response(data=None, message="用户已删除")
