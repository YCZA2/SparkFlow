from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from core.auth import create_access_token
from models import User

from .schemas import TokenPayload

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"
TEST_USER_NICKNAME = "测试博主"


class AuthUseCase:
    """封装本地联调用的测试认证逻辑。"""

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

    def issue_test_token(self, *, db: Session) -> TokenPayload:
        """签发测试令牌前先补齐测试用户记录。"""
        self.ensure_test_user(db=db)
        access_token = create_access_token(user_id=TEST_USER_ID, role=TEST_USER_ROLE)
        return TokenPayload(access_token=access_token, token_type="bearer")

    def refresh_token(self, user_id: str, role: str) -> TokenPayload:
        """为当前用户刷新访问令牌。"""
        access_token = create_access_token(user_id=user_id, role=role)
        return TokenPayload(access_token=access_token, token_type="bearer")
