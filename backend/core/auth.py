"""
JWT Authentication utilities.

Provides token creation and validation for API authentication.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import settings
from .exceptions import AuthenticationError

# JWT configuration
ALGORITHM = "HS256"

# HTTP Bearer security scheme
security = HTTPBearer(auto_error=False)


def create_access_token(
    user_id: str,
    role: str = "user",
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token.

    创建 JWT 访问令牌

    Args:
        user_id: User unique identifier
        role: User role ('user' or 'creator')
        expires_delta: Token expiration time, defaults to settings.ACCESS_TOKEN_EXPIRE_MINUTES

    Returns:
        Encoded JWT token string
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": user_id,  # Subject (user identifier)
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),  # Issued at
        "type": "access"
    }

    encoded_jwt = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.

    解码并验证 JWT 令牌

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        AuthenticationError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError(
            message="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(
            message=f"Invalid token: {str(e)}",
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    Dependency to get the current authenticated user from the token.

    从请求头中获取当前认证用户

    Args:
        credentials: HTTP Bearer credentials from Authorization header

    Returns:
        User dictionary with 'user_id' and 'role'

    Raises:
        AuthenticationError: If no token provided or token is invalid
    """
    if credentials is None:
        raise AuthenticationError(
            message="Authentication required. Please provide a valid token.",
        )

    token = credentials.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    role = payload.get("role", "user")

    if user_id is None:
        raise AuthenticationError(
            message="Invalid token: missing user identifier",
        )

    return {
        "user_id": user_id,
        "role": role,
        "exp": payload.get("exp")
    }


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    Dependency to optionally get the current user.

    可选地获取当前用户（用于公开端点但支持认证）

    Args:
        credentials: HTTP Bearer credentials

    Returns:
        User dictionary or None if not authenticated
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except AuthenticationError:
        return None


# Token response model
class TokenResponse:
    """Token response structure."""

    @staticmethod
    def create(access_token: str, token_type: str = "bearer") -> Dict[str, Any]:
        """
        Create a standardized token response.

        创建标准化的令牌响应

        Args:
            access_token: The JWT access token
            token_type: Token type (default: bearer)

        Returns:
            Token response dictionary
        """
        return {
            "access_token": access_token,
            "token_type": token_type
        }
