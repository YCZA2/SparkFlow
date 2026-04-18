from __future__ import annotations

import asyncio
from contextlib import suppress
from types import SimpleNamespace
from uuid import uuid4

from domains.pipelines import repository as pipeline_repository
from models import PipelineRun, PipelineStepRun

"""legacy pipeline runtime compatibility exports."""

from modules.shared.tasks.runtime import (
    TaskDefinitionRegistry as PipelineDefinitionRegistry,
    TaskRecoveryService as PipelineRecoveryService,
    TaskRunner as PipelineRunner,
)
from modules.shared.tasks.task_types import (
    RETRY_STRATEGY_FROM_FAILED_STEP,
    RETRY_STRATEGY_FROM_START,
    TaskExecutionContext as PipelineExecutionContext,
    TaskExecutionError as PipelineExecutionError,
    TaskStepDefinition as PipelineStepDefinition,
)


class StepExecutorRegistry:
    """legacy executor registry，供旧测试继续装配步骤执行器。"""

    def __init__(self) -> None:
        self._definitions: dict[str, PipelineStepDefinition] = {}

    def register(self, pipeline_type: str, definition: PipelineStepDefinition) -> None:
        """按 pipeline 类型登记单步定义。"""
        self._definitions[pipeline_type] = definition

    def get(self, pipeline_type: str) -> PipelineStepDefinition | None:
        """读取某个 pipeline 类型的执行定义。"""
        return self._definitions.get(pipeline_type)


class PipelineDispatcher:
    """legacy dispatcher 最小兼容实现，仅服务旧运行时测试。"""

    def __init__(
        self,
        *,
        session_factory,
        container,
        definition_registry: PipelineDefinitionRegistry,
        executor_registry: StepExecutorRegistry,  # noqa: ARG002
        worker_poll_interval: float = 0.1,
    ) -> None:
        self.session_factory = session_factory
        self.container = container
        self.definition_registry = definition_registry
        self.worker_poll_interval = worker_poll_interval
        self.worker_id = f"legacy-dispatcher-{uuid4()}"
        self._wake_event = asyncio.Event()
        self._stop_requested = False
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        """启动旧 dispatcher 的后台轮询任务。"""
        if self._task is None or self._task.done():
            self._stop_requested = False
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """停止后台轮询任务，并吞掉关闭过程中的取消异常。"""
        self._stop_requested = True
        self._wake_event.set()
        if self._task is None:
            return
        task = self._task
        self._task = None
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    def wake_up(self) -> None:
        """唤醒等待中的轮询任务。"""
        self._wake_event.set()

    async def run_once(self) -> bool:
        """执行一次抢占与单步推进。"""
        with self.session_factory() as db:
            step = pipeline_repository.claim_next_runnable_step(
                db=db,
                worker_id=self.worker_id,
            )
        if step is None:
            return False
        await self._execute_step(step_id=step.id)
        return True

    async def _run_loop(self) -> None:
        """持续执行轮询，直到收到停止信号。"""
        while not self._stop_requested:
            progressed = await self.run_once()
            if progressed:
                continue
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=self.worker_poll_interval)
            except TimeoutError:
                continue
            finally:
                self._wake_event.clear()

    async def _execute_step(self, *, step_id: str) -> None:
        """执行单个旧流水线步骤，并收敛成功/失败状态。"""
        with self.session_factory() as db:
            step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).first()
            if step is None:
                return
            run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).first()
            if run is None:
                return
            definitions = self.definition_registry.get(run.pipeline_type)
            definition = next((item for item in definitions if item.step_name == step.step_name), None)
            if definition is None or definition.executor is None:
                raise RuntimeError(f"missing legacy pipeline definition: {run.pipeline_type}:{step.step_name}")
            step_outputs = pipeline_repository.get_step_payloads(db=db, run_id=run.id)

            def _get_step_output(step_name: str) -> dict:
                return step_outputs.get(step_name, {})

            context = SimpleNamespace(
                db=db,
                session_factory=self.session_factory,
                run=run,
                step=step,
                container=self.container,
                step_outputs=step_outputs,
                input_payload=pipeline_repository.load_json(run.input_payload_json),
                get_step_output=_get_step_output,
            )
            executor = definition.executor
            try:
                output = await executor(context) or {}
            except asyncio.CancelledError:
                await self._handle_step_error(
                    step_id=step_id,
                    message="step cancelled",
                    retryable=False,
                )
                return
            except PipelineExecutionError as exc:
                await self._handle_step_error(
                    step_id=step_id,
                    message=str(exc),
                    retryable=exc.retryable,
                )
                return
            except Exception as exc:  # noqa: BLE001
                await self._handle_step_error(
                    step_id=step_id,
                    message=str(exc) or "unknown error",
                    retryable=False,
                )
                return
        await self._handle_step_success(step_id=step_id, output=output)

    async def _handle_step_success(
        self,
        *,
        step_id: str,
        output: dict | None,
        trigger_followup_wake: bool = True,
    ) -> None:
        """在单事务内推进步骤成功与 run 终态，失败时自动回滚。"""
        with self.session_factory() as db:
            step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).first()
            if step is None:
                return
            run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).first()
            if run is None:
                return
            try:
                pipeline_repository.mark_step_succeeded(
                    db=db,
                    step_id=step_id,
                    output_payload=output,
                    external_ref=output.get("external_ref") if isinstance((output or {}).get("external_ref"), dict) else None,
                    auto_commit=False,
                )
                steps = pipeline_repository.list_steps(db=db, run_id=run.id)
                current_step = next((item for item in steps if item.id == step_id), None)
                next_step = None
                if current_step is not None:
                    next_step = next((item for item in steps if item.step_order > current_step.step_order), None)
                if next_step is None:
                    pipeline_repository.mark_run_succeeded(
                        db=db,
                        run_id=run.id,
                        output_payload=(output or {}).get("run_output") if isinstance((output or {}).get("run_output"), dict) else output,
                        resource_type=(output or {}).get("resource_type"),
                        resource_id=(output or {}).get("resource_id"),
                        auto_commit=False,
                    )
                else:
                    run.status = "queued"
                    run.current_step = next_step.step_name
                    run.error_message = None
                    run.next_retry_at = None
                db.commit()
            except Exception:
                db.rollback()
                raise
        if trigger_followup_wake:
            self.wake_up()

    async def _handle_step_error(
        self,
        *,
        step_id: str,
        message: str,
        retryable: bool,
        trigger_followup_wake: bool = True,
    ) -> None:
        """收敛旧流水线错误状态，并在可重试时恢复为 waiting_retry。"""
        with self.session_factory() as db:
            step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).first()
            if step is None:
                return
            if step.status == "succeeded":
                return
            if retryable and pipeline_repository.step_has_remaining_attempts(step):
                pipeline_repository.mark_step_waiting_retry(
                    db=db,
                    step_id=step_id,
                    error_message=message,
                    retry_delay_seconds=1,
                )
            else:
                pipeline_repository.mark_step_failed(
                    db=db,
                    step_id=step_id,
                    error_message=message,
                )
        if trigger_followup_wake:
            self.wake_up()


__all__ = [
    "PipelineExecutionContext",
    "PipelineExecutionError",
    "PipelineStepDefinition",
    "RETRY_STRATEGY_FROM_FAILED_STEP",
    "RETRY_STRATEGY_FROM_START",
    "StepExecutorRegistry",
    "PipelineDefinitionRegistry",
    "PipelineRunner",
    "PipelineDispatcher",
    "PipelineRecoveryService",
]
