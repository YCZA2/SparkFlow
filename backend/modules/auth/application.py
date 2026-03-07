from __future__ import annotations

from core.auth import TokenResponse, create_access_token

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"


class AuthUseCase:
    def issue_test_token(self) -> dict[str, str]:
        access_token = create_access_token(user_id=TEST_USER_ID, role=TEST_USER_ROLE)
        return TokenResponse.create(access_token=access_token)

    def refresh_token(self, user_id: str, role: str) -> dict[str, str]:
        access_token = create_access_token(user_id=user_id, role=role)
        return TokenResponse.create(access_token=access_token)
