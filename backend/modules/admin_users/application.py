"""管理员用户管理业务逻辑——读写分离的两个服务类。"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.users import repository as user_repository
from models import User
from modules.auth.password_service import hash_password

from .schemas import (
    BatchOperationResponse,
    DeviceSessionItem,
    DeviceSessionListResponse,
    SystemStatsResponse,
    UserDetailResponse,
    UserListResponse,
    UserStatsItem,
    UserSummaryItem,
    UserUpdateRequest,
)

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _map_user_summary(user) -> UserSummaryItem:
    """将 User ORM 对象映射为列表摘要 schema。"""
    return UserSummaryItem(
        id=user.id,
        role=user.role,
        nickname=user.nickname,
        email=user.email,
        status=user.status,
        storage_quota=user.storage_quota,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


def _map_session_item(session) -> DeviceSessionItem:
    """将 DeviceSession ORM 对象映射为会话 schema。"""
    return DeviceSessionItem(
        id=session.id,
        device_id=session.device_id,
        session_version=session.session_version,
        status=session.status,
        created_at=session.created_at,
        last_seen_at=session.last_seen_at,
        revoked_at=session.revoked_at,
    )


class AdminUserQueryService:
    """封装管理员用户读操作：列表、详情、会话查询和系统统计。"""

    def list_users(
        self,
        *,
        db: Session,
        limit: int,
        offset: int,
        role=None,
        status=None,
        search=None,
        created_after=None,
        created_before=None,
    ) -> UserListResponse:
        """分页列出用户，附带与过滤条件匹配的总数。"""
        filter_kwargs = dict(
            role=role,
            status=status,
            search=search,
            created_after=created_after,
            created_before=created_before,
        )
        users = user_repository.list_users(db, limit=limit, offset=offset, **filter_kwargs)
        total = user_repository.count_users(db, **filter_kwargs)
        return UserListResponse(
            items=[_map_user_summary(u) for u in users],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_user_detail(self, *, db: Session, user_id: str) -> UserDetailResponse:
        """获取用户详情，附带碎片、成稿、知识库文档计数和最后活跃时间。"""
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)
        stats = UserStatsItem(
            fragment_count=user_repository.count_fragments_by_user(db, user_id=user_id),
            script_count=user_repository.count_scripts_by_user(db, user_id=user_id),
            knowledge_doc_count=user_repository.count_knowledge_docs_by_user(db, user_id=user_id),
            last_activity_at=user_repository.get_last_activity_at(db, user_id=user_id),
        )
        summary = _map_user_summary(user)
        return UserDetailResponse(**summary.model_dump(), stats=stats)

    def list_user_sessions(self, *, db: Session, user_id: str) -> DeviceSessionListResponse:
        """列出用户所有设备会话（含已撤销）。"""
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)
        sessions = user_repository.list_sessions_by_user(db, user_id=user_id)
        return DeviceSessionListResponse(
            items=[_map_session_item(s) for s in sessions],
            total=len(sessions),
        )

    def get_system_stats(self, *, db: Session) -> SystemStatsResponse:
        """返回系统级用户统计：总数、活跃数、今日新增。"""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        return SystemStatsResponse(
            total_users=user_repository.count_total_users(db),
            active_users=user_repository.count_active_users(db),
            new_users_today=user_repository.count_new_users_today(db, today_start=today_start),
        )


class AdminUserCommandService:
    """封装管理员用户写操作：修改、删除、密码重置和批量操作。"""

    def update_user(
        self,
        *,
        db: Session,
        user_id: str,
        payload: UserUpdateRequest,
        requesting_user_id: str,
    ) -> UserDetailResponse:
        """更新用户信息，校验邮箱唯一性（如有变更），返回更新后详情。"""
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)

        # 若邮箱有变更，校验格式并检查唯一性
        new_email = payload.email
        if new_email is not None:
            new_email = new_email.strip().lower()
            if not _EMAIL_PATTERN.match(new_email):
                raise ValidationError("请输入有效的邮箱地址", {"email": "invalid"})
            existing = db.query(User).filter(
                User.email == new_email,
                User.id != user_id,
            ).first()
            if existing:
                raise ValidationError("该邮箱已被其他用户使用", {"email": "duplicate"})

        user_repository.update_user(
            db,
            user=user,
            nickname=payload.nickname,
            email=new_email,
            role=payload.role,
            status=payload.status,
            storage_quota=payload.storage_quota,
        )
        # 复用查询服务获取完整详情（含统计）
        return AdminUserQueryService().get_user_detail(db=db, user_id=user_id)

    def delete_user(
        self,
        *,
        db: Session,
        user_id: str,
        requesting_user_id: str,
        hard: bool = False,
    ) -> None:
        """删除用户（软删或硬删），禁止管理员删除自身账号。"""
        if user_id == requesting_user_id:
            raise ValidationError("不允许删除当前登录的管理员账号")
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)
        if hard:
            user_repository.hard_delete_user(db, user=user)
        else:
            user_repository.soft_delete_user(db, user=user)

    def reset_password(self, *, db: Session, user_id: str, new_password: str) -> None:
        """为指定用户强制设置新密码，使用 bcrypt 哈希存储。"""
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)
        user.password_hash = hash_password(new_password)
        db.commit()

    def revoke_all_sessions(self, *, db: Session, user_id: str) -> None:
        """撤销指定用户的所有活跃设备会话，强制其重新登录。"""
        user = user_repository.get_by_id(db, user_id=user_id)
        if user is None:
            raise NotFoundError(message="用户不存在", resource_type="user", resource_id=user_id)
        user_repository.revoke_all_sessions(
            db, user_id=user_id, revoked_at=datetime.now(timezone.utc)
        )

    def batch_operation(
        self,
        *,
        db: Session,
        user_ids: list[str],
        action: str,
        requesting_user_id: str,
    ) -> BatchOperationResponse:
        """批量激活、停用或删除用户，跳过不存在的 ID，禁止操作自身。"""
        affected = 0
        for uid in user_ids:
            # 跳过自身，防止管理员误操作锁定自己
            if uid == requesting_user_id:
                continue
            user = user_repository.get_by_id(db, user_id=uid)
            if user is None:
                continue
            if action == "activate":
                user_repository.update_user(db, user=user, status="active")
            elif action == "deactivate":
                user_repository.update_user(db, user=user, status="inactive")
            elif action == "delete":
                user_repository.soft_delete_user(db, user=user)
            affected += 1
        return BatchOperationResponse(affected=affected, action=action)
