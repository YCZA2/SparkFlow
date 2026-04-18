"""legacy pipeline type compatibility exports."""

from modules.shared.tasks.task_types import (
    RETRY_STRATEGY_FROM_FAILED_STEP,
    RETRY_STRATEGY_FROM_START,
    TaskExecutionContext as PipelineExecutionContext,
    TaskExecutionError as PipelineExecutionError,
    TaskStepDefinition as PipelineStepDefinition,
)

__all__ = [
    "RETRY_STRATEGY_FROM_FAILED_STEP",
    "RETRY_STRATEGY_FROM_START",
    "PipelineExecutionContext",
    "PipelineExecutionError",
    "PipelineStepDefinition",
]
