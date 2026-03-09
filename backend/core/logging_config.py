"""日志配置工具。"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from .config import settings


def _rename_logger_key(_: Any, __: str, event_dict: structlog.types.EventDict) -> structlog.types.EventDict:
    """将 structlog 的 logger 字段统一映射为 module。"""
    logger_name = event_dict.pop("logger", None)
    if logger_name and "module" not in event_dict:
        event_dict["module"] = logger_name
    return event_dict


def configure_logging() -> None:
    """初始化应用级结构化日志配置。"""
    timestamper = structlog.processors.TimeStamper(fmt="iso")
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _rename_logger_key,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    renderer: structlog.types.Processor
    if settings.LOG_JSON:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
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


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """获取带 module 字段的结构化 logger。"""
    return structlog.stdlib.get_logger(name).bind(module=name)
