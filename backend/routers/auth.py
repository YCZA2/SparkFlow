"""
认证路由模块。

提供用户认证和令牌管理的 API 端点。
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core import success_response, create_access_token, TokenResponse
from core.auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class TokenRequest(BaseModel):
    """令牌请求模型（预留用于实际登录功能）。"""
    username: str | None = None
    password: str | None = None


# 测试用户配置
TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"


@router.post("/token")
async def get_token(request: TokenRequest | None = None):
    """
    获取测试用户的访问令牌。

    获取测试用户访问令牌

    此端点为硬编码的测试用户返回有效的 JWT 令牌。
    仅用于开发/测试目的。

    参数:
        request: 可选的登录凭证（当前测试用户会忽略此参数）

    返回:
        包含 access_token 和 token_type 的令牌响应
    """
    # 创建测试用户的访问令牌
    access_token = create_access_token(
        user_id=TEST_USER_ID,
        role=TEST_USER_ROLE
    )

    return success_response(
        data=TokenResponse.create(access_token=access_token),
        message="测试用户令牌创建成功"
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    获取当前已认证用户的信息。

    获取当前认证用户信息

    此端点需要在 Authorization 请求头中提供有效的 JWT 令牌。

    返回:
        当前用户信息
    """
    return success_response(
        data={
            "user_id": current_user["user_id"],
            "role": current_user["role"],
        },
        message="用户信息获取成功"
    )


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """
    刷新访问令牌。

    刷新访问令牌

    创建具有延长过期时间的新令牌。

    返回:
        新的令牌响应
    """
    new_token = create_access_token(
        user_id=current_user["user_id"],
        role=current_user["role"]
    )

    return success_response(
        data=TokenResponse.create(access_token=new_token),
        message="令牌刷新成功"
    )
