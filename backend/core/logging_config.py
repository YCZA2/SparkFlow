"""日志配置工具。"""

from __future__ import annotations

from datetime import datetime
import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from typing import Any

import structlog

from .config import settings
from utils.time import get_app_timezone

ACCESS_LOGGER_NAME = "sparkflow.access"
MOBILE_DEBUG_LOGGER_NAME = "sparkflow.mobile_debug"
_NOISY_LOGGER_LEVELS = {
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "apscheduler": logging.WARNING,
    "sqlalchemy.engine": logging.WARNING,
}


class _MaxLevelFilter(logging.Filter):
    """限制 handler 仅接收不高于指定级别的日志。"""

    def __init__(self, max_level: int) -> None:
        super().__init__()
        self.max_level = max_level

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno <= self.max_level


def _rename_logger_key(_: Any, __: str, event_dict: structlog.types.EventDict) -> structlog.types.EventDict:
    """将 structlog 的 logger 字段统一映射为 module。"""
    logger_name = event_dict.pop("logger", None)
    if logger_name and "module" not in event_dict:
        event_dict["module"] = logger_name
    return event_dict


def _build_timestamp_processor() -> structlog.types.Processor:
    """按应用时区写入 ISO 时间戳，便于本地联调直接按北京时间排障。"""
    timezone = get_app_timezone()

    def _add_timestamp(
        _: Any,
        __: str,
        event_dict: structlog.types.EventDict,
    ) -> structlog.types.EventDict:
        event_dict["timestamp"] = datetime.now(timezone).isoformat()
        return event_dict

    return _add_timestamp


def _build_shared_processors() -> list[structlog.types.Processor]:
    """构建控制台和文件日志共享的处理器链。"""
    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _rename_logger_key,
        _build_timestamp_processor(),
        structlog.processors.StackInfoRenderer(),
    ]
    if settings.LOG_JSON:
        processors.append(structlog.processors.format_exc_info)
    return processors


def _build_processor_formatter(
    *,
    renderer: structlog.types.Processor,
    shared_processors: list[structlog.types.Processor],
) -> structlog.stdlib.ProcessorFormatter:
    """创建统一的 structlog formatter。"""
    return structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )


def _reset_logger_handlers(logger: logging.Logger) -> None:
    """替换 handler 前先关闭旧句柄，避免文件句柄泄漏。"""
    for handler in logger.handlers:
        handler.close()
    logger.handlers.clear()


def _resolve_logger_file_specs(logger: logging.Logger) -> list[tuple[str, int]]:
    """读取 logger 当前绑定的文件路径和级别，供重复配置时做幂等判断。"""
    file_specs: list[tuple[str, int]] = []
    for handler in logger.handlers:
        if isinstance(handler, logging.FileHandler):
            file_specs.append((os.path.abspath(handler.baseFilename), handler.level))
    return file_specs


def _build_rotating_file_handler(
    *,
    path: str,
    shared_processors: list[structlog.types.Processor],
    level: int,
    max_level: int | None = None,
) -> TimedRotatingFileHandler:
    """创建按天轮转的 JSON 文件日志 handler，可按级别范围分流。"""
    absolute_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    file_handler = TimedRotatingFileHandler(
        absolute_path,
        when="midnight",
        backupCount=7,
        encoding="utf-8",
    )
    file_handler.setFormatter(
        _build_processor_formatter(
            renderer=structlog.processors.JSONRenderer(),
            shared_processors=shared_processors,
        )
    )
    file_handler.setLevel(level)
    if max_level is not None:
        file_handler.addFilter(_MaxLevelFilter(max_level))
    return file_handler


def _configure_file_only_logger(
    *,
    logger_name: str,
    shared_processors: list[structlog.types.Processor],
    paths: list[tuple[str, int]],
) -> None:
    """配置只落盘、不向控制台传播的文件专用 logger。"""
    logger = logging.getLogger(logger_name)
    expected_specs = [(os.path.abspath(path), level) for path, level in paths]
    if _resolve_logger_file_specs(logger) == expected_specs and logger.propagate is False:
        return

    _reset_logger_handlers(logger)
    for path, level in paths:
        logger.addHandler(
            _build_rotating_file_handler(
                path=path,
                shared_processors=shared_processors,
                level=level,
            )
        )
    logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    logger.propagate = False


def _configure_mobile_debug_logger(shared_processors: list[structlog.types.Processor]) -> None:
    """为移动端调试日志配置专用 JSON 文件输出。"""
    _configure_file_only_logger(
        logger_name=MOBILE_DEBUG_LOGGER_NAME,
        shared_processors=shared_processors,
        paths=[
            (
                settings.MOBILE_DEBUG_LOG_PATH,
                getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
            )
        ],
    )


def _configure_access_logger(shared_processors: list[structlog.types.Processor]) -> None:
    """为请求访问日志配置只落文件的结构化 logger。"""
    _configure_file_only_logger(
        logger_name=ACCESS_LOGGER_NAME,
        shared_processors=shared_processors,
        paths=[
            (
                settings.BACKEND_LOG_PATH,
                getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
            ),
            (settings.BACKEND_ERROR_LOG_PATH, logging.ERROR),
        ],
    )


def _configure_external_loggers() -> None:
    """统一压低第三方库噪音并关闭 uvicorn access 输出。"""
    for logger_name, level in _NOISY_LOGGER_LEVELS.items():
        noisy_logger = logging.getLogger(logger_name)
        noisy_logger.setLevel(level)
        noisy_logger.propagate = True

    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    _reset_logger_handlers(uvicorn_access_logger)
    uvicorn_access_logger.setLevel(logging.WARNING)
    uvicorn_access_logger.propagate = False

    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    _reset_logger_handlers(uvicorn_error_logger)
    uvicorn_error_logger.setLevel(logging.ERROR)
    uvicorn_error_logger.propagate = True


def configure_logging() -> None:
    """初始化应用级结构化日志配置。"""
    shared_processors = _build_shared_processors()
    file_shared_processors = [
        *shared_processors,
        *([] if settings.LOG_JSON else [structlog.processors.format_exc_info]),
    ]
    renderer: structlog.types.Processor
    if settings.LOG_JSON:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    formatter = _build_processor_formatter(
        renderer=renderer,
        shared_processors=shared_processors,
    )
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.setLevel(logging.WARNING)
    stdout_handler.addFilter(_MaxLevelFilter(logging.WARNING))

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(formatter)
    stderr_handler.setLevel(logging.ERROR)

    all_file_handler = _build_rotating_file_handler(
        path=settings.BACKEND_LOG_PATH,
        shared_processors=file_shared_processors,
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    )
    error_file_handler = _build_rotating_file_handler(
        path=settings.BACKEND_ERROR_LOG_PATH,
        shared_processors=file_shared_processors,
        level=logging.ERROR,
    )

    root_logger = logging.getLogger()
    _reset_logger_handlers(root_logger)
    root_logger.addHandler(stdout_handler)
    root_logger.addHandler(stderr_handler)
    root_logger.addHandler(all_file_handler)
    root_logger.addHandler(error_file_handler)
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configure_external_loggers()
    _configure_access_logger(file_shared_processors)
    _configure_mobile_debug_logger(file_shared_processors)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """获取带 module 字段的结构化 logger。"""
    return structlog.stdlib.get_logger(name).bind(module=name)


def get_access_logger() -> structlog.stdlib.BoundLogger:
    """获取只落盘、不输出到控制台的访问日志 logger。"""
    return structlog.stdlib.get_logger(ACCESS_LOGGER_NAME).bind(module="http.access")


def get_mobile_debug_logger() -> structlog.stdlib.BoundLogger:
    """获取落盘到移动端调试日志文件的结构化 logger。"""
    shared_processors = _build_shared_processors()
    file_shared_processors = [
        *shared_processors,
        *([] if settings.LOG_JSON else [structlog.processors.format_exc_info]),
    ]
    _configure_mobile_debug_logger(file_shared_processors)
    return structlog.stdlib.get_logger(MOBILE_DEBUG_LOGGER_NAME).bind(module="modules.debug_logs.mobile")
