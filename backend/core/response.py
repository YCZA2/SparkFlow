"""
API Response standardization.

Provides consistent response formatting for all API endpoints.
"""

from typing import Optional, Dict, Any, TypeVar, Generic
from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """Error detail model."""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ResponseModel(BaseModel, Generic[T]):
    """
    Standard API response model.

    All API responses follow this structure:
    {
        "success": true/false,
        "data": { ... } or null,
        "message": "..." or null,
        "error": { ... } or null
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
    Create a success response.

    Args:
        data: Response data payload
        message: Optional success message

    Returns:
        Formatted success response dictionary
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
    Create an error response.

    Args:
        code: Error code (e.g., 'FRAGMENT_NOT_FOUND')
        message: Human-readable error message
        details: Optional additional error details

    Returns:
        Formatted error response dictionary
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
    message: str = "Resource created successfully"
) -> Dict[str, Any]:
    """
    Create a 'resource created' success response.

    Args:
        data: The created resource data
        message: Success message

    Returns:
        Formatted success response dictionary
    """
    return success_response(data=data, message=message)


def deleted_response(
    message: str = "Resource deleted successfully"
) -> Dict[str, Any]:
    """
    Create a 'resource deleted' success response.

    Args:
        message: Success message

    Returns:
        Formatted success response dictionary
    """
    return success_response(data=None, message=message)
