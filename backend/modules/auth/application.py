from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from core.auth import create_access_token
from models import User
from domains.device_sessions import repository as device_session_repository

from .schemas import TokenPayload

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"
TEST_USER_NICKNAME = "测试博主"


class AuthUseCase:
    """封装本地联调用的测试认证逻辑。"""

    @staticmethod
    def _now() -> datetime:
        """统一生成设备会话的当前时间。"""
        return datetime.now(timezone.utc)

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
        db.commit()
        return next_version

    def ensure_test_user(self, *, db: Session) -> User:
        """确保本地联调用的测试用户在数据库中存在。"""
        if not inspect(db.bind).has_table("users"):
            return User(id=TEST_USER_ID, role=TEST_USER_ROLE, nickname=TEST_USER_NICKNAME)

        existing_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        if existing_user:
            if existing_user.role != TEST_USER_ROLE or existing_user.nickname != TEST_USER_NICKNAME:
                existing_user.role = TEST_USER_ROLE
                existing_user.nickname = TEST_USER_NICKNAME
                db.commit()
                db.refresh(existing_user)
            return existing_user

        test_user = User(
            id=TEST_USER_ID,
            role=TEST_USER_ROLE,
            nickname=TEST_USER_NICKNAME,
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        return test_user

    def issue_test_token(self, *, db: Session, device_id: str) -> TokenPayload:
        """签发测试令牌前先补齐测试用户记录。"""
        self.ensure_test_user(db=db)
        session_version = self._activate_device_session(db=db, user_id=TEST_USER_ID, device_id=device_id)
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

    def refresh_token(self, user_id: str, role: str, device_id: str | None, session_version: int | None) -> TokenPayload:
        """为当前用户刷新访问令牌。"""
        resolved_device_id = str(device_id or "sparkflow-default-device")
        resolved_session_version = int(session_version or 1)
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
