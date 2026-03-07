"""
自定义应用程序异常模块

为不同的错误场景定义异常层次结构，
实现整个应用程序的一致错误处理
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class AppException(Exception):
    """
    应用程序异常基类

    所有自定义异常都应继承自此类
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
        """将异常转换为字典格式"""
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
        """转换为 FastAPI HTTPException"""
        return HTTPException(
            status_code=self.status_code,
            detail=self.to_dict()["error"]
        )


class NotFoundError(AppException):
    """请求的资源不存在时抛出"""

    def __init__(
        self,
        message: str = "资源不存在",
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
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details if details else None
        )


class ValidationError(AppException):
    """请求校验失败时抛出"""

    def __init__(
        self,
        message: str = "校验失败",
        field_errors: Optional[Dict[str, str]] = None
    ):
        super().__init__(
            message=message,
            code="VALIDATION",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            details=field_errors
        )


class AuthenticationError(AppException):
    """认证失败时抛出"""

    def __init__(
        self,
        message: str = "认证失败"
    ):
        super().__init__(
            message=message,
            code="AUTHENTICATION",
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class PermissionDeniedError(AppException):
    """用户权限不足时抛出"""

    def __init__(
        self,
        message: str = "权限不足"
    ):
        super().__init__(
            message=message,
            code="PERMISSION_DENIED",
            status_code=status.HTTP_403_FORBIDDEN
        )


class ConflictError(AppException):
    """资源冲突时抛出"""

    def __init__(
        self,
        message: str = "资源冲突"
    ):
        super().__init__(
            message=message,
            code="CONFLICT",
            status_code=status.HTTP_409_CONFLICT
        )


class ServiceUnavailableError(AppException):
    """外部服务不可用时抛出"""

    def __init__(
        self,
        message: str = "服务暂时不可用",
        service_name: Optional[str] = None
    ):
        details = {"service": service_name} if service_name else None
        super().__init__(
            message=message,
            code="EXTERNAL_SERVICE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details
        )
