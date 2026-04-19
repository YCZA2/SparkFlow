"""SparkFlow backend application entrypoint."""

import os
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any, Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect
import structlog

from core import settings, AppException, success_response
from core.auth import decode_token
from core.exceptions import (
    AuthenticationError,
)
from core.logging_config import configure_logging, get_access_logger, get_logger
from models import SessionLocal
from modules.auth.application import AuthUseCase
from modules.admin_users.presentation import router as admin_users_router
from modules.auth.presentation import router as auth_router
from modules.backups.presentation import router as backups_router
from modules.debug_logs.presentation import router as debug_logs_router
from modules.external_media.presentation import router as external_media_router
from modules.exports.presentation import router as exports_router
from modules.fragment_folders.presentation import router as fragment_folders_router
from modules.fragments.presentation import router as fragments_router
from modules.fragments.derivative_task import (
    TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
    build_fragment_derivative_task_service,
)
from modules.knowledge.presentation import router as knowledge_router
from modules.media_assets.presentation import router as media_assets_router
from modules.tasks.presentation import router as tasks_router
from modules.scripts.application import DailyPushUseCase
from modules.scripts.daily_push_task import (
    TASK_TYPE_DAILY_PUSH_GENERATION,
    build_daily_push_task_service,
)
from modules.knowledge.reference_script_task import (
    build_reference_script_processing_task_service,
    TASK_TYPE_REFERENCE_SCRIPT_PROCESSING,
)
from modules.scripts.rag_task import (
    build_rag_script_task_service,
    TASK_TYPE_RAG_SCRIPT_GENERATION,
)
from modules.scripts.presentation import router as scripts_router
from modules.scripts.writing_context_builder import (
    refresh_fragment_methodology_entries_for_all_users,
)
from modules.document_import.task_steps import (
    DocumentImportStepExecutor,
    TASK_TYPE_DOCUMENT_IMPORT,
)
from modules.document_import.presentation import router as document_import_router
from modules.shared.media.audio_ingestion import (
    build_media_ingestion_task_service,
    TASK_TYPE_MEDIA_INGESTION,
)
from modules.shared.infrastructure.container import ServiceContainer, build_container
from modules.shared.tasks.bootstrap import configure_task_runtime
from modules.transcriptions.presentation import router as transcriptions_router
from modules.scheduler.application import SchedulerService, create_scheduler

configure_logging()
logger = get_logger(__name__)
access_logger = get_access_logger()


def ensure_local_test_user() -> None:
    """在本地启动阶段补齐默认测试用户，避免联调请求触发外键错误。"""
    if not settings.ENABLE_TEST_AUTH:
        return
    with SessionLocal() as db:
        if not inspect(db.bind).has_table("users"):
            return
        AuthUseCase().ensure_test_user(db=db)


def _extract_request_user_id(request: Request) -> str | None:
    """尽力从 Bearer token 提取用户标识，避免 access 日志缺少上下文。"""
    authorization = request.headers.get("authorization") or ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = decode_token(token)
    except AuthenticationError:
        return None
    user_id = payload.get("sub")
    return str(user_id) if user_id else None


def _build_request_log_fields(
    *,
    request: Request,
    request_id: str,
    duration_ms: int,
    status_code: int,
    user_id: str | None,
) -> dict[str, Any]:
    """统一生成访问日志字段，确保完成态与失败态格式一致。"""
    payload: dict[str, Any] = {
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_ms": duration_ms,
    }
    if user_id:
        payload["user_id"] = user_id
    return payload


def create_app(*, enable_runtime_side_effects: bool = True) -> FastAPI:
    """创建并装配 FastAPI 应用实例。"""
    container = build_container()
    runtime = configure_task_runtime(container)
    scheduler_service = _build_scheduler_service(container)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # 中文注释：测试 smoke/contract 可关闭启动副作用，避免数据库和调度器耦合。
        if enable_runtime_side_effects:
            ensure_local_test_user()
        logger.info(
            "app_startup",
            runtime_side_effects_enabled=enable_runtime_side_effects,
            scheduler_enabled=False,
            celery_enabled=bool(container.celery_app),
        )
        try:
            yield
        finally:
            logger.info("app_shutdown")
            scheduler_service.stop()

    app = FastAPI(
        title=settings.APP_NAME,
        description="灵感编导 AI - 后端 API 服务",
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    app.state.container = container
    app.state.scheduler_service = scheduler_service
    app.state.celery_app = runtime.celery_app

    @app.middleware("http")
    async def bind_request_context(request: Request, call_next):
        """为每个请求绑定上下文并写入统一访问日志。"""
        request_id = request.headers.get("x-request-id") or uuid4().hex
        user_id = _extract_request_user_id(request)
        started_at = perf_counter()
        request.state.request_id = request_id
        request.state.user_id = user_id
        structlog.contextvars.clear_contextvars()
        context_fields: dict[str, Any] = {
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
        }
        if user_id:
            context_fields["user_id"] = user_id
        structlog.contextvars.bind_contextvars(**context_fields)
        try:
            response = await call_next(request)
            duration_ms = int((perf_counter() - started_at) * 1000)
            access_logger.info(
                "http_request_completed",
                **_build_request_log_fields(
                    request=request,
                    request_id=request_id,
                    duration_ms=duration_ms,
                    status_code=response.status_code,
                    user_id=user_id,
                ),
            )
            response.headers["X-Request-Id"] = request_id
            return response
        except Exception as exc:
            duration_ms = int((perf_counter() - started_at) * 1000)
            access_logger.error(
                "http_request_failed",
                error=str(exc),
                **_build_request_log_fields(
                    request=request,
                    request_id=request_id,
                    duration_ms=duration_ms,
                    status_code=500,
                    user_id=user_id,
                ),
            )
            raise
        finally:
            structlog.contextvars.clear_contextvars()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if settings.FILE_STORAGE_PROVIDER == "local":
        app.mount(
            "/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads"
        )
    # 挂载管理后台静态文件目录
    _static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(_static_dir):
        app.mount("/static", StaticFiles(directory=_static_dir), name="static")

    register_exception_handlers(app)
    register_routes(app)
    return app


def register_exception_handlers(app: FastAPI) -> None:
    """注册统一异常处理器。"""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.exception_handler(AuthenticationError)
    async def auth_exception_handler(request: Request, exc: AuthenticationError):
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc):
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "data": None,
                "message": None,
                "error": {
                    "code": "NOT_FOUND",
                    "message": "请求的资源未找到",
                    "details": {"path": str(request.url)},
                },
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("unhandled_exception", path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "data": None,
                "message": None,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "发生内部服务器错误",
                    "details": None if not settings.DEBUG else {"error": str(exc)},
                },
            },
        )


def register_routes(app: FastAPI) -> None:
    """注册应用公开路由。"""

    @app.get("/admin", include_in_schema=False)
    async def admin_ui():
        """提供管理后台 HTML 页面。"""
        admin_file = os.path.join(os.path.dirname(__file__), "static", "admin.html")
        return FileResponse(admin_file)

    @app.get("/")
    async def root():
        return build_root_health_payload()

    @app.head("/")
    async def root_head() -> Response:
        return Response(status_code=200)

    @app.get("/health")
    async def health_check():
        container = app.state.container
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
                services_status[name] = (
                    "available" if await health_check_factory() else "unavailable"
                )
            except Exception as exc:
                services_status[name] = f"error: {str(exc)}"

        await _check_service_status(
            "llm", True, lambda: container.llm_provider.health_check()
        )
        await _check_service_status(
            "stt", True, lambda: container.stt_provider.health_check()
        )
        await _check_service_status(
            "vector_db", True, lambda: container.vector_store.health_check()
        )

        return success_response(
            data={
                "status": "ok",
                "version": settings.APP_VERSION,
                "debug": settings.DEBUG,
                "services": services_status,
            }
        )

    @app.head("/health")
    async def health_check_head() -> Response:
        return Response(status_code=200)

    app.include_router(admin_users_router)
    app.include_router(auth_router)
    app.include_router(backups_router)
    app.include_router(debug_logs_router)
    app.include_router(document_import_router)
    app.include_router(external_media_router)
    app.include_router(exports_router)
    app.include_router(fragment_folders_router)
    app.include_router(fragments_router)
    app.include_router(media_assets_router)
    app.include_router(transcriptions_router)
    app.include_router(scripts_router)
    app.include_router(knowledge_router)
    app.include_router(tasks_router)


def _build_scheduler_service(container: ServiceContainer) -> SchedulerService:
    """构建带每日推盘和写作上下文维护任务的调度服务。"""
    scheduler = create_scheduler()

    async def run_daily_push_job() -> None:
        with container.session_factory() as db:
            use_case = DailyPushUseCase(
                pipeline_service=build_daily_push_task_service(container),
            )
            return await use_case.run_daily_job(db=db)

    async def run_writing_context_job() -> None:
        with container.session_factory() as db:
            return await refresh_fragment_methodology_entries_for_all_users(
                db=db,
                llm_provider=container.llm_provider,
            )

    return SchedulerService(
        scheduler=scheduler,
        run_job=run_daily_push_job,
        run_writing_context_job=run_writing_context_job,
    )

def build_root_health_payload() -> dict:
    """构建根路径健康检查载荷。"""
    return success_response(data={"status": "ok", "version": settings.APP_VERSION})


app = create_app()
