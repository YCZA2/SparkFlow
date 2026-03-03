"""
Authentication routes.

Provides endpoints for user authentication and token management.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core import success_response, error_response, create_access_token, TokenResponse
from core.auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class TokenRequest(BaseModel):
    """Token request model (for future use with actual login)."""
    username: str | None = None
    password: str | None = None


class TokenResponseModel(BaseModel):
    """Token response model."""
    access_token: str
    token_type: str


# Test user configuration
TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"


@router.post("/token")
async def get_token(request: TokenRequest | None = None):
    """
    Get access token for test user.

    获取测试用户访问令牌

    This endpoint returns a valid JWT token for the hardcoded test user.
    For development/testing purposes only.

    Args:
        request: Optional login credentials (currently ignored for test user)

    Returns:
        Token response with access_token and token_type
    """
    # 创建测试用户的访问令牌
    access_token = create_access_token(
        user_id=TEST_USER_ID,
        role=TEST_USER_ROLE
    )

    return success_response(
        data=TokenResponse.create(access_token=access_token),
        message="Token created successfully for test user"
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user information.

    获取当前认证用户信息

    This endpoint requires a valid JWT token in the Authorization header.

    Returns:
        Current user information
    """
    return success_response(
        data={
            "user_id": current_user["user_id"],
            "role": current_user["role"],
        },
        message="User information retrieved successfully"
    )


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """
    Refresh access token.

    刷新访问令牌

    Creates a new token with extended expiration time.

    Returns:
        New token response
    """
    new_token = create_access_token(
        user_id=current_user["user_id"],
        role=current_user["role"]
    )

    return success_response(
        data=TokenResponse.create(access_token=new_token),
        message="Token refreshed successfully"
    )
