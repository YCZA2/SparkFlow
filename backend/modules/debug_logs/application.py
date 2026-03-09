from __future__ import annotations

from core import settings
from core.logging_config import get_mobile_debug_logger

from .schemas import MobileDebugLogFileStatus, MobileDebugLogItem

class MobileDebugLogService:
    """将移动端调试日志写入统一结构化日志链路。"""

    @staticmethod
    def _resolve_log_method(level: str):
        """按客户端等级选择最接近的结构化日志级别。"""
        logger = get_mobile_debug_logger()
        normalized = level.strip().lower()
        if normalized in {"critical", "fatal"}:
            return logger.critical
        if normalized == "error":
            return logger.error
        if normalized in {"warn", "warning"}:
            return logger.warning
        if normalized == "debug":
            return logger.debug
        return logger.info

    def append(self, *, user_id: str, payload: MobileDebugLogItem) -> MobileDebugLogFileStatus:
        """将移动端日志以统一结构化格式写入专用文件。"""
        log_method = self._resolve_log_method(payload.level)
        log_method(
            "mobile_debug_log",
            client_timestamp=payload.timestamp,
            client_level=payload.level,
            source=payload.source,
            mobile_message=payload.message,
            context=payload.context,
            user_id=user_id,
        )
        return MobileDebugLogFileStatus(path=settings.MOBILE_DEBUG_LOG_PATH, appended=True)
