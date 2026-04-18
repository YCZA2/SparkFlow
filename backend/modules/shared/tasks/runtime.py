from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from celery import Celery
from sqlalchemy.orm import Session, sessionmaker

from domains.tasks import repository as task_repository
from models import TaskRun

from .task_types import (
    RETRY_STRATEGY_FROM_FAILED_STEP,
    RETRY_STRATEGY_FROM_START,
    TaskStepDefinition,
)


class TaskDefinitionRegistry:
    """维护任务类型到步骤定义的注册表。"""

    def __init__(self) -> None:
        self._definitions: dict[str, list[TaskStepDefinition]] = {}

    def register(self, task_type: str, definitions: list[TaskStepDefinition]) -> None:
        """注册完整的任务步骤定义。"""
        self._definitions[task_type] = definitions

    def get(self, task_type: str) -> list[TaskStepDefinition]:
        """读取某类任务的步骤定义。"""
        try:
            return self._definitions[task_type]
        except KeyError as exc:
            raise RuntimeError(f"missing task definition: {task_type}") from exc


class LegacyPipelineDispatcherAdapter:
    """向旧测试和兼容代码暴露最小 dispatcher 行为。"""

    def __init__(self) -> None:
        self.enabled = True

    def start(self) -> None:
        """恢复自动投递。"""
        self.enabled = True

    async def stop(self) -> None:
        """暂停自动投递，保留“只创建任务不执行”的旧测试语义。"""
        self.enabled = False

    def wake_up(self) -> None:
        """手动恢复自动投递。"""
        self.enabled = True


@dataclass
class TaskRuntimeState:
    """封装 Celery 任务运行所需的共享状态。"""

    container: Any
    celery_app: Celery
    definition_registry: TaskDefinitionRegistry


class TaskRunner:
    """负责创建持久化任务运行记录并投递首个 Celery 步骤。"""

    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        definition_registry: TaskDefinitionRegistry,
        celery_app: Celery,
        dispatcher: LegacyPipelineDispatcherAdapter | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.definition_registry = definition_registry
        self.celery_app = celery_app
        self.dispatcher = dispatcher

    async def create_run(
        self,
        *,
        run_id: str | None,
        user_id: str,
        pipeline_type: str,
        input_payload: dict[str, Any] | None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        auto_wake: bool = True,
    ) -> TaskRun:
        """创建任务记录并按需投递第一个步骤。"""
        definitions = self.definition_registry.get(pipeline_type)
        with self.session_factory() as db:
            run = task_repository.create_run(
                db=db,
                run_id=run_id,
                user_id=user_id,
                task_type=pipeline_type,
                input_payload=input_payload,
                resource_type=resource_type,
                resource_id=resource_id,
                steps=[
                    {
                        "step_name": definition.step_name,
                        "max_attempts": definition.max_attempts,
                        "input_payload": definition.input_payload,
                    }
                    for definition in definitions
                ],
            )
        dispatcher_enabled = self.dispatcher is None or self.dispatcher.enabled
        if auto_wake and definitions and dispatcher_enabled:
            from modules.shared.celery.tasks import enqueue_task_step

            result = enqueue_task_step(
                celery_app=self.celery_app,
                task_run_id=run.id,
                task_type=pipeline_type,
                step_name=definitions[0].step_name,
                queue=definitions[0].queue,
            )
            with self.session_factory() as db:
                task_repository.set_run_celery_root_id(db=db, run_id=run.id, celery_root_id=result.id)
        with self.session_factory() as db:
            refreshed = task_repository.get_by_id(db=db, user_id=user_id, run_id=run.id)
        return refreshed or run


class TaskRecoveryService:
    """封装任务重试入口。"""

    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        definition_registry: TaskDefinitionRegistry,
        celery_app: Celery,
        dispatcher: LegacyPipelineDispatcherAdapter | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.definition_registry = definition_registry
        self.celery_app = celery_app
        self.dispatcher = dispatcher

    async def retry_run(self, *, user_id: str, run_id: str, strategy: str) -> TaskRun:
        """重置失败任务并重新投递起始步骤。"""
        with self.session_factory() as db:
            run = task_repository.retry_run(db=db, user_id=user_id, run_id=run_id, strategy=strategy)
        definitions = self.definition_registry.get(run.task_type)
        dispatcher_enabled = self.dispatcher is None or self.dispatcher.enabled
        if definitions and run.current_step and dispatcher_enabled:
            definition = next((item for item in definitions if item.step_name == run.current_step), definitions[0])
            from modules.shared.celery.tasks import enqueue_task_step

            result = enqueue_task_step(
                celery_app=self.celery_app,
                task_run_id=run.id,
                task_type=run.task_type,
                step_name=definition.step_name,
                queue=definition.queue,
            )
            with self.session_factory() as db:
                task_repository.set_run_celery_root_id(db=db, run_id=run.id, celery_root_id=result.id)
                refreshed = task_repository.get_by_id(db=db, user_id=user_id, run_id=run.id)
                if refreshed is not None:
                    return refreshed
        return run


__all__ = [
    "RETRY_STRATEGY_FROM_FAILED_STEP",
    "RETRY_STRATEGY_FROM_START",
    "TaskDefinitionRegistry",
    "LegacyPipelineDispatcherAdapter",
    "TaskRuntimeState",
    "TaskRunner",
    "TaskRecoveryService",
]
