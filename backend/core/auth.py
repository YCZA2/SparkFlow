"""
JWT 认证工具模块

提供 API 认证的令牌创建和验证功能
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import settings
from .exceptions import AuthenticationError
from models import SessionLocal, User
from domains.device_sessions import repository as device_session_repository

# JWT 配置
ALGORITHM = "HS256"

# HTTP Bearer 安全方案
security = HTTPBearer(auto_error=False)


def create_access_token(
    user_id: str,
    role: str = "user",
    device_id: str | None = None,
    session_version: int | None = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    创建 JWT 访问令牌

    Args:
        user_id: 用户唯一标识符
        role: 用户角色 ('user' 或 'creator')
        expires_delta: 令牌过期时间，默认为 settings.ACCESS_TOKEN_EXPIRE_MINUTES

    Returns:
        编码后的 JWT 令牌字符串
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": user_id,  # 主题（用户标识符）
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),  # 签发时间
        "type": "access",
    }
    if device_id:
        payload["device_id"] = device_id
    if session_version is not None:
        payload["session_version"] = session_version

    encoded_jwt = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """
    解码并验证 JWT 令牌

    Args:
        token: JWT 令牌字符串

    Returns:
        解码后的令牌载荷

    Raises:
        AuthenticationError: 令牌无效或已过期时抛出
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError(
            message="令牌已过期",
        )
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(
            message=f"无效的令牌: {str(e)}",
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    从请求头中获取当前认证用户

    Args:
        credentials: 来自 Authorization 请求头的 HTTP Bearer 凭证

    Returns:
        包含 'user_id' 和 'role' 的用户字典

    Raises:
        AuthenticationError: 未提供令牌或令牌无效时抛出
    """
    if credentials is None:
        raise AuthenticationError(
            message="需要进行认证，请提供有效的令牌。",
        )

    token = credentials.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    role = payload.get("role", "user")
    device_id = payload.get("device_id")
    session_version = payload.get("session_version")

    if user_id is None:
        raise AuthenticationError(
            message="无效的令牌：缺少用户标识符",
        )

    if device_id and session_version is not None:
        with SessionLocal() as db:
            session = device_session_repository.get_by_user_and_device(
                db=db,
                user_id=user_id,
                device_id=str(device_id),
            )
            if (
                session is None
                or session.status != "active"
                or int(session.session_version) != int(session_version)
            ):
                raise AuthenticationError(message="当前设备会话已失效，请重新登录")
            user = db.query(User).filter(User.id == user_id).first()
            if user is None or user.status != "active":
                raise AuthenticationError(message="当前账号不可用，请重新登录")
            device_session_repository.touch_session(
                db=db,
                session=session,
                seen_at=datetime.now(timezone.utc),
            )
            db.commit()

    return {
        "user_id": user_id,
        "role": role,
        "exp": payload.get("exp"),
        "device_id": device_id,
        "session_version": session_version,
    }


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    可选地获取当前用户（用于公开端点但支持认证）

    Args:
        credentials: HTTP Bearer 凭证

    Returns:
        用户字典，如果未认证则返回 None
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except AuthenticationError:
        return None


# 令牌响应模型
class TokenResponse:
    """令牌响应结构"""

    @staticmethod
    def create(access_token: str, token_type: str = "bearer") -> Dict[str, Any]:
        """
        创建标准化的令牌响应

        Args:
            access_token: JWT 访问令牌
            token_type: 令牌类型（默认为 bearer）

        Returns:
            令牌响应字典
        """
        return {
            "access_token": access_token,
            "token_type": token_type
        }
