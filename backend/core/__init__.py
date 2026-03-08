"""
Core infrastructure module.

Contains:
- Configuration management
- Authentication utilities
- Response formatting
- Exception definitions
"""

from .config import settings, Settings
from .exceptions import (
    AppException,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    PermissionDeniedError,
)
from .response import success_response, error_response, deleted_response, ResponseModel, paginated_data
from .auth import (
    create_access_token,
    decode_token,
    get_current_user,
    get_optional_user,
    TokenResponse,
    security,
)

__all__ = [
    "settings",
    "Settings",
    "AppException",
    "NotFoundError",
    "ValidationError",
    "AuthenticationError",
    "PermissionDeniedError",
    "success_response",
    "error_response",
    "deleted_response",
    "ResponseModel",
    "paginated_data",
    "create_access_token",
    "decode_token",
    "get_current_user",
    "get_optional_user",
    "TokenResponse",
    "security",
]
