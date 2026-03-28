from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.exceptions import PermissionDeniedError, ValidationError
from domains.device_sessions import repository as device_session_repository
from models import ContentMediaLink, PipelineRun, PipelineStepRun, User, DeviceSession
from modules.auth.password_service import hash_password

from .schemas import AdminBootstrapStatusResponse, AdminUserSummary


class AdminUseCase:
    """封装用户管理后台的查询、命令和安全保护逻辑。"""

    @staticmethod
    def _now() -> datetime:
        """统一生成后台操作使用的当前时间。"""
        return datetime.now(timezone.utc)

    @staticmethod
    def ensure_admin(current_user: dict) -> None:
        """校验当前请求是否具备管理员权限。"""
        if current_user.get("role") != "admin":
            raise PermissionDeniedError("需要管理员权限")

    @staticmethod
    def get_bootstrap_status(*, db: Session) -> AdminBootstrapStatusResponse:
        """返回系统是否已完成首个管理员初始化。"""
        has_admin = db.query(User).filter(User.role == "admin").count() > 0
        return AdminBootstrapStatusResponse(has_admin=has_admin, bootstrap_open=not has_admin)

    @staticmethod
    def _validate_role(role: str) -> str:
        """校验用户角色，只允许 admin 或 user。"""
        if role not in {"admin", "user"}:
            raise ValidationError("角色值无效", {"role": "invalid"})
        return role

    @staticmethod
    def _validate_status(status: str) -> str:
        """校验用户状态，只允许 active 或 inactive。"""
        if status not in {"active", "inactive"}:
            raise ValidationError("状态值无效", {"status": "invalid"})
        return status

    @staticmethod
    def _normalize_email(email: str) -> str:
        """统一把邮箱转成小写并去除首尾空白。"""
        return (email or "").strip().lower()

    @staticmethod
    def _build_default_nickname(email: str) -> str:
        """根据邮箱前缀生成默认昵称。"""
        return f"用户{email.split('@')[0][:8]}"

    @staticmethod
    def _serialize_user(user: User, *, active_session_count: int = 0) -> AdminUserSummary:
        """把用户模型映射成后台列表项。"""
        return AdminUserSummary(
            user_id=user.id,
            email=user.email,
            nickname=user.nickname,
            role=user.role,
            status=user.status,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            active_session_count=active_session_count,
        )

    @staticmethod
    def _count_admins(*, db: Session) -> int:
        """统计当前系统中的管理员数量。"""
        return db.query(User).filter(User.role == "admin").count()

    @staticmethod
    def _count_active_admins(*, db: Session) -> int:
        """统计当前仍可登录的管理员数量。"""
        return db.query(User).filter(User.role == "admin", User.status == "active").count()

    def list_users(
        self,
        *,
        db: Session,
        query: str | None = None,
        role: str | None = None,
        status: str | None = None,
    ) -> list[AdminUserSummary]:
        """按搜索词和筛选条件返回后台用户列表。"""
        normalized_query = (query or "").strip()
        if role is not None:
            self._validate_role(role)
        if status is not None:
            self._validate_status(status)

        active_session_subquery = (
            db.query(
                DeviceSession.user_id.label("user_id"),
                func.count(DeviceSession.id).label("active_session_count"),
            )
            .filter(DeviceSession.status == "active")
            .group_by(DeviceSession.user_id)
            .subquery()
        )

        statement = (
            db.query(User, func.coalesce(active_session_subquery.c.active_session_count, 0))
            .outerjoin(active_session_subquery, active_session_subquery.c.user_id == User.id)
        )
        if normalized_query:
            keyword = f"%{normalized_query}%"
            statement = statement.filter(
                or_(
                    User.email.ilike(keyword),
                    User.nickname.ilike(keyword),
                )
            )
        if role is not None:
            statement = statement.filter(User.role == role)
        if status is not None:
            statement = statement.filter(User.status == status)

        rows = statement.order_by(User.created_at.desc()).all()
        return [
            self._serialize_user(user, active_session_count=int(active_session_count or 0))
            for user, active_session_count in rows
        ]

    def create_user(
        self,
        *,
        db: Session,
        email: str,
        password: str,
        nickname: str | None = None,
        role: str = "user",
    ) -> AdminUserSummary:
        """由管理员直接创建新用户账号。"""
        resolved_role = self._validate_role(role)
        normalized_email = self._normalize_email(email)
        existing = db.query(User).filter(User.email == normalized_email).first()
        if existing is not None:
            raise ValidationError("该邮箱已被注册", {"email": "already_exists"})
        user = User(
            role=resolved_role,
            nickname=nickname or self._build_default_nickname(normalized_email),
            email=normalized_email,
            password_hash=hash_password(password),
            status="active",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return self._serialize_user(user)

    def update_user(
        self,
        *,
        db: Session,
        user_id: str,
        apply_nickname: bool = False,
        nickname: str | None = None,
        role: str | None = None,
        status: str | None = None,
    ) -> AdminUserSummary:
        """更新用户资料，并阻止把系统最后一个管理员降级或禁用。"""
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise ValidationError("用户不存在", {"user_id": "not_found"})

        resolved_role = self._validate_role(role) if role is not None else user.role
        resolved_status = self._validate_status(status) if status is not None else user.status

        if user.role == "admin" and resolved_role != "admin" and self._count_admins(db=db) <= 1:
            raise ValidationError("不能把系统最后一个管理员降级为普通用户", {"role": "last_admin"})
        if user.role == "admin" and user.status == "active" and resolved_status != "active" and self._count_active_admins(db=db) <= 1:
            raise ValidationError("不能禁用系统最后一个可用管理员", {"status": "last_active_admin"})

        if apply_nickname:
            user.nickname = nickname
        user.role = resolved_role
        user.status = resolved_status
        db.commit()
        db.refresh(user)
        active_session_count = len(device_session_repository.list_active_by_user(db=db, user_id=user.id))
        return self._serialize_user(user, active_session_count=active_session_count)

    def reset_password(self, *, db: Session, user_id: str, password: str) -> None:
        """重置指定用户的登录密码。"""
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise ValidationError("用户不存在", {"user_id": "not_found"})
        user.password_hash = hash_password(password)
        db.commit()

    def force_logout_user(self, *, db: Session, user_id: str) -> None:
        """撤销指定用户的全部活跃设备会话。"""
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise ValidationError("用户不存在", {"user_id": "not_found"})
        device_session_repository.revoke_active_for_user(
            db=db,
            user_id=user_id,
            revoked_at=self._now(),
            keep_device_id=None,
        )
        db.commit()

    def delete_user(self, *, db: Session, user_id: str, current_user_id: str) -> None:
        """删除用户及其关联数据，并阻止自删或删除最后一个管理员。"""
        if user_id == current_user_id:
            raise ValidationError("不能删除当前登录账号", {"user_id": "self_delete"})
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise ValidationError("用户不存在", {"user_id": "not_found"})
        if user.role == "admin" and self._count_admins(db=db) <= 1:
            raise ValidationError("不能删除系统最后一个管理员", {"user_id": "last_admin"})

        db.query(PipelineStepRun).filter(
            PipelineStepRun.pipeline_run_id.in_(
                db.query(PipelineRun.id).filter(PipelineRun.user_id == user_id)
            )
        ).delete(synchronize_session=False)
        db.query(PipelineRun).filter(PipelineRun.user_id == user_id).delete()
        db.query(ContentMediaLink).filter(ContentMediaLink.user_id == user_id).delete()
        db.delete(user)
        db.commit()
