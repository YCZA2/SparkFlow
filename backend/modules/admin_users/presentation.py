"""管理员用户管理路由——所有端点均要求 admin 角色。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core import ResponseModel, deleted_response, require_role, success_response
from modules.shared.infrastructure.container import get_db_session

from .application import AdminUserCommandService, AdminUserQueryService
from .schemas import (
    BatchOperationRequest,
    BatchOperationResponse,
    DeviceSessionListResponse,
    PasswordResetRequest,
    SystemStatsResponse,
    UserDetailResponse,
    UserListResponse,
    UserUpdateRequest,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-users"],
    responses={
        401: {"description": "未认证"},
        403: {"description": "权限不足，需要 admin 角色"},
    },
)

# 所有端点共用的管理员身份依赖
AdminUser = Annotated[dict, Depends(require_role("admin"))]

_query_service = AdminUserQueryService()
_command_service = AdminUserCommandService()


@router.get(
    "/stats",
    response_model=ResponseModel[SystemStatsResponse],
    summary="系统用户统计",
    description="返回用户总数、活跃用户数和今日新增注册数。",
)
async def get_system_stats(
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """获取系统级用户统计数据。"""
    return success_response(
        data=_query_service.get_system_stats(db=db),
        message="统计数据获取成功",
    )


@router.get(
    "/users",
    response_model=ResponseModel[UserListResponse],
    summary="用户列表",
    description="分页列出用户，支持按角色、状态、邮箱/昵称搜索和注册时间过滤。",
)
async def list_users(
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    role: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
):
    """分页获取用户列表。"""
    return success_response(
        data=_query_service.list_users(
            db=db,
            limit=limit,
            offset=offset,
            role=role,
            status=status,
            search=search,
        ),
        message="用户列表获取成功",
    )


@router.post(
    "/users/batch",
    response_model=ResponseModel[BatchOperationResponse],
    summary="批量操作用户",
    description="批量激活、停用或软删除指定用户列表，自动跳过不存在的 ID。",
)
async def batch_users(
    payload: BatchOperationRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """对指定用户列表执行批量操作。"""
    return success_response(
        data=_command_service.batch_operation(
            db=db,
            user_ids=payload.user_ids,
            action=payload.action,
            requesting_user_id=current_user["user_id"],
        ),
        message="批量操作执行成功",
    )


@router.get(
    "/users/{user_id}",
    response_model=ResponseModel[UserDetailResponse],
    summary="用户详情",
    description="获取指定用户的详细信息，含碎片、成稿、知识库文档数量和最后活跃时间。",
)
async def get_user(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """获取单个用户详情及统计信息。"""
    return success_response(
        data=_query_service.get_user_detail(db=db, user_id=user_id),
        message="用户详情获取成功",
    )


@router.patch(
    "/users/{user_id}",
    response_model=ResponseModel[UserDetailResponse],
    summary="更新用户信息",
    description="修改用户的昵称、邮箱、角色、状态或存储配额。",
)
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """更新指定用户的基本信息。"""
    return success_response(
        data=_command_service.update_user(
            db=db,
            user_id=user_id,
            payload=payload,
            requesting_user_id=current_user["user_id"],
        ),
        message="用户信息更新成功",
    )


@router.delete(
    "/users/{user_id}",
    response_model=ResponseModel[None],
    summary="删除用户",
    description="软删除（默认）或硬删除指定用户。硬删除会级联删除所有关联数据，不可恢复。",
)
async def delete_user(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
    hard: bool = Query(False, description="是否物理删除（级联删除所有关联数据）"),
):
    """删除指定用户，默认为软删除。"""
    _command_service.delete_user(
        db=db,
        user_id=user_id,
        requesting_user_id=current_user["user_id"],
        hard=hard,
    )
    return deleted_response("用户删除成功")


@router.get(
    "/users/{user_id}/sessions",
    response_model=ResponseModel[DeviceSessionListResponse],
    summary="用户设备会话列表",
    description="列出指定用户的所有设备会话记录，含已撤销的历史会话。",
)
async def list_user_sessions(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """获取用户的所有设备会话。"""
    return success_response(
        data=_query_service.list_user_sessions(db=db, user_id=user_id),
        message="设备会话列表获取成功",
    )


@router.delete(
    "/users/{user_id}/sessions",
    response_model=ResponseModel[None],
    summary="强制登出用户",
    description="撤销指定用户的所有活跃设备会话，使其立即掉线。",
)
async def revoke_user_sessions(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """强制撤销用户的所有活跃会话。"""
    _command_service.revoke_all_sessions(db=db, user_id=user_id)
    return deleted_response("已强制登出用户所有设备")


@router.post(
    "/users/{user_id}/reset-password",
    response_model=ResponseModel[None],
    summary="重置用户密码",
    description="管理员为指定用户强制设置新密码。",
)
async def reset_user_password(
    user_id: str,
    payload: PasswordResetRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db_session),
):
    """管理员强制重置指定用户的密码。"""
    _command_service.reset_password(db=db, user_id=user_id, new_password=payload.new_password)
    return success_response(data=None, message="密码重置成功")
