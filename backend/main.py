"""SparkFlow backend application entrypoint."""
import logging
from contextlib import asynccontextmanager
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from core import settings, AppException, success_response
from core.exceptions import (
    AuthenticationError,
)
from modules.auth.presentation import router as auth_router
from modules.fragments.presentation import router as fragments_router
from modules.knowledge.presentation import router as knowledge_router
from modules.scripts.application import DailyPushUseCase
from modules.scripts.presentation import router as scripts_router
from modules.shared.container import ServiceContainer, build_container
from modules.transcriptions.presentation import router as transcriptions_router
from modules.scheduler.application import SchedulerService, create_scheduler

logger = logging.getLogger(__name__)

def create_app() -> FastAPI:
    container = build_container()
    scheduler_service = _build_scheduler_service(container)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        scheduler_service.start()
        try:
            yield
        finally:
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

    register_exception_handlers(app)
    register_routes(app)
    return app


def register_exception_handlers(app: FastAPI) -> None:
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
                    "details": None if not settings.DEBUG else {"error": str(exc)},
                },
            },
        )


def register_routes(app: FastAPI) -> None:
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

        async def _check_service_status(name: str, enabled: bool, health_check_factory: Callable[[], Awaitable[bool]]) -> None:
            if not enabled:
                services_status[name] = "disabled"
                return
            try:
                services_status[name] = "available" if await health_check_factory() else "unavailable"
            except Exception as exc:
                services_status[name] = f"error: {str(exc)}"

        await _check_service_status("llm", True, lambda: container.llm_provider.health_check())
        await _check_service_status("stt", True, lambda: container.stt_provider.health_check())
        await _check_service_status("vector_db", True, lambda: container.vector_store.health_check())

        return success_response(
            data={"status": "ok", "version": settings.APP_VERSION, "debug": settings.DEBUG, "services": services_status}
        )

    @app.head("/health")
    async def health_check_head() -> Response:
        return Response(status_code=200)

    app.include_router(auth_router)
    app.include_router(fragments_router)
    app.include_router(transcriptions_router)
    app.include_router(scripts_router)
    app.include_router(knowledge_router)


def _build_scheduler_service(container: ServiceContainer) -> SchedulerService:
    scheduler = create_scheduler()

    async def run_daily_push_job() -> None:
        with container.session_factory() as db:
            use_case = DailyPushUseCase(
                llm_provider=container.llm_provider,
                prompt_loader=container.prompt_loader,
                vector_store=container.vector_store,
            )
            await use_case.run_daily_job(db=db)

    return SchedulerService(scheduler=scheduler, run_job=run_daily_push_job)

def build_root_health_payload() -> dict:
    """构建根路径健康检查载荷。"""
    return success_response(data={"status": "ok", "version": settings.APP_VERSION})


app = create_app()
