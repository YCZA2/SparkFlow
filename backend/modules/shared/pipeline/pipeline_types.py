"""
流水线类型定义：错误类、步骤描述、执行上下文

这些是纯数据结构，不依赖运行时状态，可被步骤实现文件安全导入。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy.orm import Session, sessionmaker

from domains.pipelines import repository as pipeline_repository
from models import PipelineRun, PipelineStepRun

RETRY_STRATEGY_FROM_FAILED_STEP = "from_failed_step"
RETRY_STRATEGY_FROM_START = "from_start"


class PipelineExecutionError(Exception):
    """步骤执行失败时的统一异常。"""

    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass
class PipelineStepDefinition:
    """描述一个可执行的流水线步骤。"""

    step_name: str
    executor: Callable[[PipelineExecutionContext], Awaitable[dict[str, Any] | None]]
    max_attempts: int = 3
    input_payload: dict[str, Any] | None = None


@dataclass
class PipelineExecutionContext:
    """向步骤执行器暴露运行时上下文。"""

    db: Session
    session_factory: sessionmaker[Session]
    run: PipelineRun
    step: PipelineStepRun
    container: Any
    step_outputs: dict[str, dict[str, Any]]

    @property
    def input_payload(self) -> dict[str, Any]:
        """读取流水线的输入参数。"""
        return pipeline_repository.load_json(self.run.input_payload_json)

    def get_step_output(self, step_name: str) -> dict[str, Any]:
        """读取前置步骤产出。"""
        return self.step_outputs.get(step_name, {})
