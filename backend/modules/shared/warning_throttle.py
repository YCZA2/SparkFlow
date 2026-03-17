"""
日志限频工具：同一类错误在冷却窗口内只保留一次 warning。
"""

from __future__ import annotations

import time


class WarningThrottle:
    """模块级可复用的日志节流器，避免同类错误在短时间内重复刷日志。"""

    def __init__(self, throttle_seconds: float) -> None:
        """初始化节流器，指定冷却窗口时长。"""
        self._throttle_seconds = throttle_seconds
        self._last_seen: dict[tuple, float] = {}

    def should_emit(self, key: tuple, now: float | None = None) -> bool:
        """判断该 key 是否应发出 warning；同时更新记录并清理过期条目。"""
        current = now if now is not None else time.monotonic()
        self._prune(current)
        last_seen = self._last_seen.get(key)
        self._last_seen[key] = current
        if last_seen is None:
            return True
        return current - last_seen >= self._throttle_seconds

    def _prune(self, now: float) -> None:
        """清理冷却窗口已过期的记录，避免进程长期运行后缓存膨胀。"""
        expired = [k for k, t in self._last_seen.items() if now - t >= self._throttle_seconds]
        for k in expired:
            del self._last_seen[k]
