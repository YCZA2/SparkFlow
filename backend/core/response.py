"""API response helpers."""

from typing import Optional, Dict, Any, TypeVar, Generic, Callable, Iterable
from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """错误详情模型"""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ResponseModel(BaseModel, Generic[T]):
    """
    标准 API 响应模型

    所有 API 响应都遵循以下结构：
    {
        "success": true/false,
        "data": { ... } 或 null,
        "message": "..." 或 null,
        "error": { ... } 或 null
    }
    """
    success: bool
    data: Optional[T] = None
    message: Optional[str] = None
    error: Optional[ErrorDetail] = None


def success_response(
    data: Any = None,
    message: Optional[str] = None
) -> Dict[str, Any]:
    """
    创建成功响应

    Args:
        data: 响应数据载荷
        message: 可选的成功消息

    Returns:
        格式化的成功响应字典
    """
    return {
        "success": True,
        "data": data,
        "message": message,
        "error": None
    }


def error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    创建错误响应

    Args:
        code: 错误代码（如 'FRAGMENT_NOT_FOUND'）
        message: 人类可读的错误消息
        details: 可选的额外错误详情

    Returns:
        格式化的错误响应字典
    """
    return {
        "success": False,
        "data": None,
        "message": None,
        "error": {
            "code": code,
            "message": message,
            "details": details
        }
    }


def created_response(
    data: Any,
    message: str = "资源创建成功"
) -> Dict[str, Any]:
    """
    创建'资源已创建'的成功响应

    Args:
        data: 创建的资源数据
        message: 成功消息

    Returns:
        格式化的成功响应字典
    """
    return success_response(data=data, message=message)


def deleted_response(
    message: str = "资源删除成功"
) -> Dict[str, Any]:
    """
    创建'资源已删除'的成功响应

    Args:
        message: 成功消息

    Returns:
        格式化的成功响应字典
    """
    return success_response(data=None, message=message)


def paginated_data(
    items: Iterable[Any],
    total: int,
    limit: int,
    offset: int,
    serializer: Optional[Callable[[Any], Any]] = None,
) -> Dict[str, Any]:
    """Build a standard pagination payload."""
    serialized_items = [serializer(item) if serializer else item for item in items]
    return {
        "items": serialized_items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
