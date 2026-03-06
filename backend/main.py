"""
SparkFlow 后端 - FastAPI 应用程序
"""
from typing import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from fastapi import Depends

from core import settings, AppException, success_response
from core.exceptions import (
    NotFoundError,
    ValidationError,
    AuthenticationError,
)
from core.auth import get_current_user
from routers import auth, fragments, transcribe, scripts, knowledge

app = FastAPI(
    title=settings.APP_NAME,
    description="灵感编导 AI - 后端 API 服务",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境请适当配置
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 全局异常处理器
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """处理自定义应用程序异常。"""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict()
    )


@app.exception_handler(AuthenticationError)
async def auth_exception_handler(request: Request, exc: AuthenticationError):
    """处理认证错误。"""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict()
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """处理 404 未找到错误。"""
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "data": None,
            "message": None,
            "error": {
                "code": "NOT_FOUND",
                "message": "请求的资源未找到",
                "details": {"path": str(request.url)}
            }
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """处理所有未捕获的异常。"""
    # 记录错误以便调试
    import traceback
    print(f"Unhandled exception: {str(exc)}")
    print(traceback.format_exc())

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "message": None,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "发生内部服务器错误",
                "details": None if not settings.DEBUG else {"error": str(exc)}
            }
        }
    )


@app.get("/")
async def root():
    """健康检查端点"""
    return success_response(data={"status": "ok", "version": settings.APP_VERSION})


@app.get("/health")
async def health_check():
    """详细健康检查端点。"""
    services_status = {
        "database": "unknown",
        "llm": "unknown",
        "stt": "unknown",
        "vector_db": "unknown",
    }

    async def _check_service_status(
        name: str,
        enabled: bool,
        health_check_factory: Callable[[], Awaitable[bool]],
    ) -> None:
        if not enabled:
            return
        try:
            services_status[name] = "available" if await health_check_factory() else "unavailable"
        except Exception as e:
            services_status[name] = f"error: {str(e)}"

    from services.factory import get_llm_service, get_stt_service, get_vector_db_service

    await _check_service_status(
        name="llm",
        enabled=bool(settings.DASHSCOPE_API_KEY),
        health_check_factory=lambda: get_llm_service().health_check(),
    )
    await _check_service_status(
        name="stt",
        enabled=bool(settings.ALIBABA_CLOUD_ACCESS_KEY_ID),
        health_check_factory=lambda: get_stt_service().health_check(),
    )
    await _check_service_status(
        name="vector_db",
        enabled=True,
        health_check_factory=lambda: get_vector_db_service().health_check(),
    )

    return success_response(data={
        "status": "ok",
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG,
        "services": services_status
    })


# 注册路由
app.include_router(auth.router)
app.include_router(fragments.router)
app.include_router(transcribe.router)
app.include_router(scripts.router)
app.include_router(knowledge.router)


# Phase 1.2: API Response Format Test Endpoints
@app.get("/test/success")
async def test_success_response():
    """
    测试成功响应格式的端点。

    测试成功响应格式
    """
    return success_response(
        data={"items": ["fragment1", "fragment2"], "count": 2},
        message="数据获取成功"
    )


@app.get("/test/not-found")
async def test_not_found():
    """
    测试 404 错误响应格式的端点。

    测试 404 错误响应格式
    """
    raise NotFoundError(
        message="片段未找到",
        resource_type="fragment",
        resource_id="test-123"
    )


@app.get("/test/validation-error")
async def test_validation_error():
    """
    测试校验错误响应格式的端点。

    测试校验错误响应格式
    """
    raise ValidationError(
        message="输入数据无效",
        field_errors={"title": "标题不能为空", "content": "内容过长"}
    )


# Phase 1.3: Authentication Test Endpoints
@app.get("/test/protected")
async def test_protected_endpoint(current_user: dict = Depends(get_current_user)):
    """
    测试需要认证的受保护端点。

    测试受保护端点（需要认证）

    此端点需要在 Authorization 请求头中提供有效的 JWT 令牌。
    使用格式：Authorization: Bearer <token>

    返回:
        当前用户信息
    """
    return success_response(
        data={
            "message": "您已访问受保护资源",
            "user": current_user
        },
        message="访问已授权"
    )


@app.get("/test/auth-check")
async def test_auth_check(current_user: dict = Depends(get_current_user)):
    """
    验证认证是否正常工作。

    验证认证是否正常工作
    """
    return success_response(
        data={
            "authenticated": True,
            "user_id": current_user["user_id"],
            "role": current_user["role"],
        },
        message="认证已验证"
    )
