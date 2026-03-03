"""
Custom application exceptions.

Defines a hierarchy of exceptions for different error scenarios,
allowing consistent error handling across the application.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class AppException(Exception):
    """
    Base application exception.

    All custom exceptions should inherit from this class.
    """

    def __init__(
        self,
        message: str,
        code: str = "APP_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary format."""
        return {
            "success": False,
            "data": None,
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details if self.details else None
            }
        }

    def to_http_exception(self) -> HTTPException:
        """Convert to FastAPI HTTPException."""
        return HTTPException(
            status_code=self.status_code,
            detail=self.to_dict()["error"]
        )


class NotFoundError(AppException):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        message: str = "Resource not found",
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None
    ):
        details = {}
        if resource_type:
            details["resource_type"] = resource_type
        if resource_id:
            details["resource_id"] = resource_id

        super().__init__(
            message=message,
            code="NOT_FOUND_ERROR",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details if details else None
        )


class ValidationError(AppException):
    """Raised when request validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        field_errors: Optional[Dict[str, str]] = None
    ):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=field_errors
        )


class AuthenticationError(AppException):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication failed"
    ):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class PermissionDeniedError(AppException):
    """Raised when user lacks permission for an action."""

    def __init__(
        self,
        message: str = "Permission denied"
    ):
        super().__init__(
            message=message,
            code="PERMISSION_DENIED_ERROR",
            status_code=status.HTTP_403_FORBIDDEN
        )


class ConflictError(AppException):
    """Raised when there's a resource conflict."""

    def __init__(
        self,
        message: str = "Resource conflict"
    ):
        super().__init__(
            message=message,
            code="CONFLICT_ERROR",
            status_code=status.HTTP_409_CONFLICT
        )


class ServiceUnavailableError(AppException):
    """Raised when an external service is unavailable."""

    def __init__(
        self,
        message: str = "Service temporarily unavailable",
        service_name: Optional[str] = None
    ):
        details = {"service": service_name} if service_name else None
        super().__init__(
            message=message,
            code="SERVICE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details
        )
