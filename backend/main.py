"""
SparkFlow Backend - FastAPI Application
"""
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from core import settings, AppException, success_response
from core.exceptions import (
    NotFoundError,
    ValidationError,
    AuthenticationError,
    PermissionDeniedError,
)

app = FastAPI(
    title=settings.APP_NAME,
    description="灵感编导 AI - 后端 API 服务",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle custom application exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict()
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Handle 404 not found errors."""
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "data": None,
            "message": None,
            "error": {
                "code": "NOT_FOUND",
                "message": "The requested resource was not found",
                "details": {"path": str(request.url)}
            }
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions."""
    # Log the error for debugging
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
                "message": "An internal server error occurred",
                "details": None if not settings.DEBUG else {"error": str(exc)}
            }
        }
    )


@app.get("/")
async def root():
    """Health check endpoint"""
    return success_response(data={"status": "ok", "version": settings.APP_VERSION})


@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    services_status = {
        "database": "unknown",
        "llm": "unknown",
        "stt": "unknown",
        "vector_db": "unknown",
    }

    # Check services if credentials are configured
    if settings.DASHSCOPE_API_KEY:
        try:
            from services.factory import get_llm_service
            llm = get_llm_service()
            services_status["llm"] = "available" if await llm.health_check() else "unavailable"
        except Exception as e:
            services_status["llm"] = f"error: {str(e)}"

    if settings.ALIBABA_CLOUD_ACCESS_KEY_ID:
        try:
            from services.factory import get_stt_service
            stt = get_stt_service()
            services_status["stt"] = "available" if await stt.health_check() else "unavailable"
        except Exception as e:
            services_status["stt"] = f"error: {str(e)}"

    try:
        from services.factory import get_vector_db_service
        vector_db = get_vector_db_service()
        services_status["vector_db"] = "available" if await vector_db.health_check() else "unavailable"
    except Exception as e:
        services_status["vector_db"] = f"error: {str(e)}"

    return success_response(data={
        "status": "ok",
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG,
        "services": services_status
    })
