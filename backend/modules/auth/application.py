from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from core.auth import create_access_token
from core.exceptions import AuthenticationError, ValidationError
from domains.device_sessions import repository as device_session_repository
from models import User

from .password_service import hash_password, verify_password
from .schemas import (
    AuthenticatedUserPayload,
    CurrentUserResponse,
    LoginResponse,
    TokenPayload,
)

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"
TEST_USER_NICKNAME = "测试博主"
TEST_USER_EMAIL = "test@sparkflow.dev"
TEST_USER_PASSWORD = "test123456"

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthUseCase:
    """封装邮箱密码登录、设备会话和开发测试认证逻辑。"""

    @staticmethod
    def _now() -> datetime:
        """统一生成认证链路中的当前时间。"""
        return datetime.now(timezone.utc)

    @staticmethod
    def _normalize_email(email: str) -> str:
        """将邮箱地址转为小写并校验格式。"""
        normalized = (email or "").strip().lower()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValidationError("请输入有效的邮箱地址", {"email": "invalid"})
        return normalized

    @staticmethod
    def _validate_password(password: str) -> None:
        """校验密码是否满足最低强度要求（至少8位）。"""
        if not password or len(password) < 8:
            raise ValidationError("密码至少需要8位", {"password": "too_short"})

    @staticmethod
    def _build_user_payload(user: User, *, device_id: str | None = None, session_version: int | None = None) -> AuthenticatedUserPayload:
        """把用户模型映射为认证返回载荷。"""
        return AuthenticatedUserPayload(
            user_id=user.id,
            role=user.role,
            nickname=user.nickname,
            email=user.email,
            status=user.status,
            device_id=device_id,
            session_version=session_version,
        )

    def _activate_device_session(self, *, db: Session, user_id: str, device_id: str) -> int:
        """为当前设备开启会话，并撤销其它在线设备。"""
        now = self._now()
        current = device_session_repository.get_by_user_and_device(
            db=db,
            user_id=user_id,
            device_id=device_id,
        )
        next_version = (current.session_version + 1) if current else 1
        device_session_repository.revoke_active_for_user(
            db=db,
            user_id=user_id,
            revoked_at=now,
            keep_device_id=device_id,
        )
        device_session_repository.create_or_replace_active_session(
            db=db,
            user_id=user_id,
            device_id=device_id,
            session_version=next_version,
            created_at=now,
        )
        db.flush()
        return next_version

    def ensure_test_user(self, *, db: Session) -> User:
        """确保本地联调用的测试用户在数据库中存在。"""
        if not inspect(db.bind).has_table("users"):
            return User(id=TEST_USER_ID, role=TEST_USER_ROLE, nickname=TEST_USER_NICKNAME)

        existing_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        if existing_user:
            needs_update = (
                existing_user.role != TEST_USER_ROLE
                or existing_user.nickname != TEST_USER_NICKNAME
                or not existing_user.email
            )
            if needs_update:
                existing_user.role = TEST_USER_ROLE
                existing_user.nickname = TEST_USER_NICKNAME
                existing_user.email = TEST_USER_EMAIL
                existing_user.password_hash = hash_password(TEST_USER_PASSWORD)
                existing_user.status = "active"
                db.commit()
                db.refresh(existing_user)
            return existing_user

        test_user = User(
            id=TEST_USER_ID,
            role=TEST_USER_ROLE,
            nickname=TEST_USER_NICKNAME,
            email=TEST_USER_EMAIL,
            password_hash=hash_password(TEST_USER_PASSWORD),
            status="active",
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        return test_user

    def issue_test_token(self, *, db: Session, device_id: str) -> TokenPayload:
        """仅在本地开发开启时签发测试令牌。"""
        from core import settings
        if not settings.ENABLE_TEST_AUTH:
            raise AuthenticationError("测试登录入口已关闭")
        self.ensure_test_user(db=db)
        session_version = self._activate_device_session(db=db, user_id=TEST_USER_ID, device_id=device_id)
        db.commit()
        access_token = create_access_token(
            user_id=TEST_USER_ID,
            role=TEST_USER_ROLE,
            device_id=device_id,
            session_version=session_version,
        )
        return TokenPayload(
            access_token=access_token,
            token_type="bearer",
            device_id=device_id,
            session_version=session_version,
        )

    def register_with_email(
        self,
        *,
        db: Session,
        email: str,
        password: str,
        device_id: str,
        nickname: str | None = None,
    ) -> LoginResponse:
        """使用邮箱和密码注册新用户，注册成功后自动登录。"""
        normalized_email = self._normalize_email(email)
        self._validate_password(password)
        existing = db.query(User).filter(User.email == normalized_email).first()
        if existing is not None:
            raise ValidationError("该邮箱已被注册", {"email": "already_exists"})
        user = User(
            role="user",
            nickname=nickname or f"用户{normalized_email.split('@')[0][:8]}",
            email=normalized_email,
            password_hash=hash_password(password),
            status="active",
        )
        db.add(user)
        db.flush()
        now = self._now()
        user.last_login_at = now
        session_version = self._activate_device_session(db=db, user_id=user.id, device_id=device_id)
        db.commit()
        db.refresh(user)
        access_token = create_access_token(
            user_id=user.id,
            role=user.role,
            device_id=device_id,
            session_version=session_version,
        )
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            device_id=device_id,
            session_version=session_version,
            user=self._build_user_payload(user, device_id=device_id, session_version=session_version),
        )

    def login_with_email_password(
        self,
        *,
        db: Session,
        email: str,
        password: str,
        device_id: str,
    ) -> LoginResponse:
        """使用邮箱和密码完成登录，更新设备会话并签发新 token。"""
        normalized_email = self._normalize_email(email)
        user = db.query(User).filter(User.email == normalized_email).first()
        # 用户不存在和密码错误返回同一错误，避免邮箱枚举
        if user is None or not verify_password(password, user.password_hash or ""):
            raise AuthenticationError("邮箱或密码错误")
        if user.status != "active":
            raise AuthenticationError("当前账号不可用，请联系管理员")
        now = self._now()
        user.last_login_at = now
        session_version = self._activate_device_session(db=db, user_id=user.id, device_id=device_id)
        db.commit()
        db.refresh(user)
        access_token = create_access_token(
            user_id=user.id,
            role=user.role,
            device_id=device_id,
            session_version=session_version,
        )
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            device_id=device_id,
            session_version=session_version,
            user=self._build_user_payload(user, device_id=device_id, session_version=session_version),
        )

    def refresh_token(self, *, db: Session, user_id: str, role: str, device_id: str | None, session_version: int | None) -> TokenPayload:
        """为当前有效设备会话刷新访问令牌。"""
        resolved_device_id = str(device_id or "sparkflow-default-device")
        session = device_session_repository.get_by_user_and_device(
            db=db,
            user_id=user_id,
            device_id=resolved_device_id,
        )
        if session is None or session.status != "active":
            raise AuthenticationError("当前设备会话已失效，请重新登录")
        resolved_session_version = int(session_version if session_version is not None else session.session_version)
        if int(session.session_version) != resolved_session_version:
            raise AuthenticationError("当前设备会话已失效，请重新登录")
        access_token = create_access_token(
            user_id=user_id,
            role=role,
            device_id=resolved_device_id,
            session_version=resolved_session_version,
        )
        return TokenPayload(
            access_token=access_token,
            token_type="bearer",
            device_id=resolved_device_id,
            session_version=resolved_session_version,
        )

    def logout(self, *, db: Session, user_id: str, device_id: str | None) -> None:
        """撤销当前设备会话，让当前 token 立即失效。"""
        if not device_id:
            return
        session = device_session_repository.get_by_user_and_device(db=db, user_id=user_id, device_id=str(device_id))
        if session is None:
            return
        now = self._now()
        session.status = "revoked"
        session.revoked_at = now
        session.updated_at = now
        db.commit()

    def build_current_user_response(self, *, db: Session, current_user: dict) -> CurrentUserResponse:
        """读取当前用户资料并返回给客户端。"""
        user = db.query(User).filter(User.id == current_user["user_id"]).first()
        if user is None:
            raise AuthenticationError("当前用户不存在，请重新登录")
        payload = self._build_user_payload(
            user,
            device_id=current_user.get("device_id"),
            session_version=current_user.get("session_version"),
        )
        return CurrentUserResponse(**payload.model_dump())
