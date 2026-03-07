"""
SparkFlow 后端 - FastAPI 应用程序
"""
import logging
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from core import settings, AppException, success_response
from core.exceptions import (
    AuthenticationError,
)
from routers import auth, fragments, knowledge, scripts, test, transcribe
from services.scheduler import start_scheduler, stop_scheduler

logger = logging.getLogger(__name__)

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


# 暴露上传音频文件，供移动端详情页播放器直接访问。
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


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
    logger.exception("Unhandled exception while handling request %s", request.url.path)

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


def build_root_health_payload() -> dict:
    """构建根路径健康检查载荷。"""
    return success_response(data={"status": "ok", "version": settings.APP_VERSION})


@app.get("/")
async def root():
    """健康检查端点"""
    return build_root_health_payload()


@app.head("/")
async def root_head() -> Response:
    """兼容移动端/浏览器使用 HEAD 探测根路径可达性。"""
    return Response(status_code=200)


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
            services_status[name] = "disabled"
            return
        try:
            services_status[name] = "available" if await health_check_factory() else "unavailable"
        except Exception as e:
            services_status[name] = f"error: {str(e)}"

    from services.factory import get_llm_service, get_stt_service, get_vector_db_service
    stt_enabled = False
    if settings.STT_PROVIDER.lower() == "dashscope":
        stt_enabled = bool(settings.DASHSCOPE_API_KEY)
    elif settings.STT_PROVIDER.lower() == "aliyun":
        stt_enabled = all(
            [
                settings.ALIBABA_CLOUD_ACCESS_KEY_ID,
                settings.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
                settings.ALIBABA_CLOUD_APP_KEY,
            ]
        )

    await _check_service_status(
        name="llm",
        enabled=bool(settings.DASHSCOPE_API_KEY),
        health_check_factory=lambda: get_llm_service().health_check(),
    )
    await _check_service_status(
        name="stt",
        enabled=stt_enabled,
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


@app.head("/health")
async def health_check_head() -> Response:
    """提供轻量级 HEAD 健康检查，便于设备做连通性探测。"""
    return Response(status_code=200)


@app.on_event("startup")
async def on_startup() -> None:
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_scheduler()


# 注册核心主链路路由
app.include_router(auth.router)
app.include_router(fragments.router)
app.include_router(transcribe.router)
app.include_router(scripts.router)

# 预留扩展能力：知识库接口仍然可用，但尚未接入主创作链路。
app.include_router(knowledge.router)
if settings.DEBUG:
    app.include_router(test.router)
