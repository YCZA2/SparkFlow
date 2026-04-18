from __future__ import annotations

from .runtime import TaskRuntimeState

_current_runtime: TaskRuntimeState | None = None


def get_current_task_runtime() -> TaskRuntimeState | None:
    """读取当前已注册的 task runtime。"""
    return _current_runtime


def set_current_task_runtime(runtime: TaskRuntimeState) -> TaskRuntimeState:
    """覆盖当前 task runtime。"""
    global _current_runtime
    _current_runtime = runtime
    return runtime


def ensure_task_runtime(container=None) -> TaskRuntimeState:
    """按需读取或初始化 task runtime。"""
    from .bootstrap import ensure_task_runtime as _ensure_task_runtime

    return _ensure_task_runtime(container)
