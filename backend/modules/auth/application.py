from __future__ import annotations

from core.auth import create_access_token

from .schemas import TokenPayload

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"


class AuthUseCase:
    def issue_test_token(self) -> TokenPayload:
        access_token = create_access_token(user_id=TEST_USER_ID, role=TEST_USER_ROLE)
        return TokenPayload(access_token=access_token, token_type="bearer")

    def refresh_token(self, user_id: str, role: str) -> TokenPayload:
        access_token = create_access_token(user_id=user_id, role=role)
        return TokenPayload(access_token=access_token, token_type="bearer")
