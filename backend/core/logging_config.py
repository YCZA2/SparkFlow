"""日志配置工具。"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

import structlog

from .config import settings

MOBILE_DEBUG_LOGGER_NAME = "sparkflow.mobile_debug"


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


def _build_shared_processors() -> list[structlog.types.Processor]:
    """构建控制台和文件日志共享的处理器链。"""
    timestamper = structlog.processors.TimeStamper(fmt="iso")
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _rename_logger_key,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]


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


def _configure_mobile_debug_logger(shared_processors: list[structlog.types.Processor]) -> None:
    """为移动端调试日志配置专用 JSON 文件输出。"""
    log_path = os.path.abspath(settings.MOBILE_DEBUG_LOG_PATH)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    file_logger = logging.getLogger(MOBILE_DEBUG_LOGGER_NAME)
    current_path = None
    if len(file_logger.handlers) == 1 and isinstance(file_logger.handlers[0], logging.FileHandler):
        current_path = os.path.abspath(file_logger.handlers[0].baseFilename)
    if current_path == log_path and file_logger.propagate is False:
        return

    _reset_logger_handlers(file_logger)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(
        _build_processor_formatter(
            renderer=structlog.processors.JSONRenderer(),
            shared_processors=shared_processors,
        )
    )
    file_logger.addHandler(file_handler)
    file_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    file_logger.propagate = False


def _build_file_handler(
    *,
    path: str,
    shared_processors: list[structlog.types.Processor],
    level: int,
    max_level: int | None = None,
) -> logging.FileHandler:
    """创建统一 JSON 文件日志 handler，可按级别范围分流。"""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    file_handler = logging.FileHandler(os.path.abspath(path), encoding="utf-8")
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


def configure_logging() -> None:
    """初始化应用级结构化日志配置。"""
    shared_processors = _build_shared_processors()
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
    stdout_handler.addFilter(_MaxLevelFilter(logging.WARNING))

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(formatter)
    stderr_handler.setLevel(logging.ERROR)

    all_file_handler = _build_file_handler(
        path=settings.BACKEND_LOG_PATH,
        shared_processors=shared_processors,
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    )
    error_file_handler = _build_file_handler(
        path=settings.BACKEND_ERROR_LOG_PATH,
        shared_processors=shared_processors,
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
    _configure_mobile_debug_logger(shared_processors)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """获取带 module 字段的结构化 logger。"""
    return structlog.stdlib.get_logger(name).bind(module=name)


def get_mobile_debug_logger() -> structlog.stdlib.BoundLogger:
    """获取落盘到移动端调试日志文件的结构化 logger。"""
    _configure_mobile_debug_logger(_build_shared_processors())
    return structlog.stdlib.get_logger(MOBILE_DEBUG_LOGGER_NAME).bind(module="modules.debug_logs.mobile")
