"""Test-only API routes."""

from fastapi import APIRouter, Depends

from core import success_response
from core.auth import get_current_user
from core.exceptions import NotFoundError, ValidationError

router = APIRouter(prefix="/test", tags=["test"])


@router.get("/success")
async def test_success_response():
    """测试成功响应格式。"""
    return success_response(
        data={"items": ["fragment1", "fragment2"], "count": 2},
        message="数据获取成功",
    )


@router.get("/not-found")
async def test_not_found():
    """测试 404 错误响应格式。"""
    raise NotFoundError(
        message="片段未找到",
        resource_type="fragment",
        resource_id="test-123",
    )


@router.get("/validation-error")
async def test_validation_error():
    """测试校验错误响应格式。"""
    raise ValidationError(
        message="输入数据无效",
        field_errors={"title": "标题不能为空", "content": "内容过长"},
    )


@router.get("/protected")
async def test_protected_endpoint(current_user: dict = Depends(get_current_user)):
    """测试受保护端点（需要认证）。"""
    return success_response(
        data={
            "message": "您已访问受保护资源",
            "user": current_user,
        },
        message="访问已授权",
    )


@router.get("/auth-check")
async def test_auth_check(current_user: dict = Depends(get_current_user)):
    """验证认证是否正常工作。"""
    return success_response(
        data={
            "authenticated": True,
            "user_id": current_user["user_id"],
            "role": current_user["role"],
        },
        message="认证已验证",
    )
