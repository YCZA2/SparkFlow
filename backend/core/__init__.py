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
from .response import success_response, error_response, ResponseModel

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
    "ResponseModel",
]
