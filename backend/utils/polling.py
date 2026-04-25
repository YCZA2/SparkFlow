"""共享轮询工具，统一同步与异步第三方任务状态轮询逻辑。"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from tenacity import (
    AsyncRetrying,
    Retrying,
    retry_if_result,
    stop_after_delay,
    wait_fixed,
    wait_incrementing,
)


def build_sync_poll_retryer(
    *,
    is_pending: Callable[[Any], bool],
    interval_seconds: float = 1.0,
    max_wait_seconds: float | None = None,
) -> Retrying:
    """构造同步第三方任务状态轮询器重试器。

    Args:
        is_pending: 判定结果是否仍处于 pending 状态。
        interval_seconds: 轮询固定间隔（秒）。
        max_wait_seconds: 最大等待时间（秒），None 表示不限制。
    """
    kwargs: dict[str, Any] = {
        "retry": retry_if_result(is_pending),
        "wait": wait_fixed(interval_seconds),
        "sleep": __import__("time").sleep,
        "reraise": True,
    }
    if max_wait_seconds is not None:
        kwargs["stop"] = stop_after_delay(max_wait_seconds)
    return Retrying(**kwargs)


def build_async_poll_retryer(
    *,
    is_pending: Callable[[Any], bool],
    interval_seconds: float = 1.0,
    max_wait_seconds: float | None = None,
    backoff_multiplier: float = 1.0,
    max_interval_seconds: float = 10.0,
) -> AsyncRetrying:
    """构造异步第三方任务状态轮询器重试器。

    Args:
        is_pending: 判定结果是否仍处于 pending 状态。
        interval_seconds: 初始轮询间隔（秒）。
        max_wait_seconds: 最大等待时间（秒），None 表示不限制。
        backoff_multiplier: 退避乘数；1.0 表示固定间隔，>1.0 表示线性退避。
        max_interval_seconds: 轮询间隔上限（秒）。
    """
    if backoff_multiplier <= 1.0:
        wait_strategy = wait_fixed(interval_seconds)
    else:
        wait_strategy = wait_incrementing(
            start=interval_seconds,
            increment=interval_seconds * (backoff_multiplier - 1.0),
            max=max_interval_seconds,
        )

    kwargs: dict[str, Any] = {
        "retry": retry_if_result(is_pending),
        "wait": wait_strategy,
        "sleep": asyncio.sleep,
        "reraise": True,
    }
    if max_wait_seconds is not None:
        kwargs["stop"] = stop_after_delay(max_wait_seconds)
    return AsyncRetrying(**kwargs)
