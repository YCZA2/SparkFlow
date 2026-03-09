from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from core.logging_config import get_logger
from domains.pipelines import repository as pipeline_repository
from models import Fragment, PipelineRun, PipelineStepRun

logger = get_logger(__name__)

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
    executor: Callable[["PipelineExecutionContext"], Awaitable[dict[str, Any] | None]]
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


class StepExecutorRegistry:
    """维护 pipeline_type + step_name 到执行器的映射。"""

    def __init__(self) -> None:
        self._executors: dict[tuple[str, str], Callable[[PipelineExecutionContext], Awaitable[dict[str, Any] | None]]] = {}

    def register(self, pipeline_type: str, definition: PipelineStepDefinition) -> None:
        """注册某类流水线的步骤执行器。"""
        self._executors[(pipeline_type, definition.step_name)] = definition.executor

    def get(self, pipeline_type: str, step_name: str) -> Callable[[PipelineExecutionContext], Awaitable[dict[str, Any] | None]]:
        """按类型和步骤名读取执行器。"""
        try:
            return self._executors[(pipeline_type, step_name)]
        except KeyError as exc:
            raise RuntimeError(f"missing executor for {pipeline_type}:{step_name}") from exc


class PipelineDefinitionRegistry:
    """维护流水线类型到步骤定义的注册表。"""

    def __init__(self) -> None:
        self._definitions: dict[str, list[PipelineStepDefinition]] = {}

    def register(self, pipeline_type: str, definitions: list[PipelineStepDefinition]) -> None:
        """注册完整的流水线定义。"""
        self._definitions[pipeline_type] = definitions

    def get(self, pipeline_type: str) -> list[PipelineStepDefinition]:
        """读取某类流水线的步骤定义。"""
        try:
            return self._definitions[pipeline_type]
        except KeyError as exc:
            raise RuntimeError(f"missing pipeline definition: {pipeline_type}") from exc


class PipelineRunner:
    """负责创建持久化流水线和唤醒后台执行。"""

    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        definition_registry: PipelineDefinitionRegistry,
        dispatcher: "PipelineDispatcher | None" = None,
    ) -> None:
        self.session_factory = session_factory
        self.definition_registry = definition_registry
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
    ) -> PipelineRun:
        """创建流水线记录并尝试唤醒 worker。"""
        definitions = self.definition_registry.get(pipeline_type)
        with self.session_factory() as db:
            run = pipeline_repository.create_run(
                db=db,
                run_id=run_id,
                user_id=user_id,
                pipeline_type=pipeline_type,
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
        if self.dispatcher and auto_wake:
            self.dispatcher.wake_up()
        return run


class PipelineDispatcher:
    """负责从数据库抢占并执行流水线步骤。"""

    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        container: Any,
        definition_registry: PipelineDefinitionRegistry,
        executor_registry: StepExecutorRegistry,
        worker_poll_interval: float = 0.2,
        stale_step_seconds: int = 30,
    ) -> None:
        self.session_factory = session_factory
        self.container = container
        self.definition_registry = definition_registry
        self.executor_registry = executor_registry
        self.worker_poll_interval = worker_poll_interval
        self.stale_step_seconds = stale_step_seconds
        self._worker_id = uuid4().hex
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        """启动后台 worker 循环。"""
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """停止后台 worker。"""
        self._stop_event.set()
        self._wake_event.set()
        task = self._task
        if task is not None:
            try:
                # 停机阶段最多等待当前步骤短暂收尾，超时后直接取消，由陈旧步骤恢复兜底。
                await asyncio.wait_for(task, timeout=max(1.0, self.worker_poll_interval * 5))
            except asyncio.TimeoutError:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            except asyncio.CancelledError:
                # worker 已进入取消态时，继续等待它落到最终完成状态，避免留下悬挂任务。
                if task.done():
                    with suppress(asyncio.CancelledError):
                        await task
                else:
                    raise
            finally:
                if not task.done():
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task
                self._task = None

    def wake_up(self) -> None:
        """主动唤醒 worker 立即抢占任务。"""
        if self._task is None or self._task.done():
            self.start()
        self._wake_event.set()

    async def _run_loop(self) -> None:
        """循环执行可运行步骤并回收超时锁。"""
        while not self._stop_event.is_set():
            try:
                progressed = await self.run_once()
                if progressed:
                    continue
                self._wake_event.clear()
                try:
                    await asyncio.wait_for(self._wake_event.wait(), timeout=self.worker_poll_interval)
                except asyncio.TimeoutError:
                    continue
            except Exception:
                logger.exception("pipeline_dispatcher_loop_failed")
                await asyncio.sleep(self.worker_poll_interval)

    async def run_once(self) -> bool:
        """执行一次步骤抢占与处理。"""
        with self.session_factory() as db:
            pipeline_repository.recover_stale_steps(db=db, stale_seconds=self.stale_step_seconds)
            step = pipeline_repository.claim_next_runnable_step(db=db, worker_id=self._worker_id)
        if step is None:
            return False
        await self._execute_step(step_id=step.id, trigger_followup_wake=True)
        return True

    async def _execute_step(self, *, step_id: str, trigger_followup_wake: bool = True) -> None:
        """执行单个步骤，并回写步骤与流水线状态。"""
        try:
            # executor 依赖 context.db 持续可用，必须覆盖到整个执行阶段，避免泄漏重开的连接。
            with self.session_factory() as db:
                step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).first()
                if step is None:
                    return
                run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).first()
                if run is None:
                    return
                step_outputs = pipeline_repository.get_step_payloads(db=db, run_id=run.id)
                context = PipelineExecutionContext(
                    db=db,
                    session_factory=self.session_factory,
                    run=run,
                    step=step,
                    container=self.container,
                    step_outputs=step_outputs,
                )
                executor = self.executor_registry.get(run.pipeline_type, step.step_name)
                output = await executor(context) or {}
            await self._handle_step_success(
                step_id=step_id,
                output=output,
                trigger_followup_wake=trigger_followup_wake,
            )
        except asyncio.CancelledError as exc:
            # 区分停机取消与业务取消，避免把 provider 抛出的取消异常漏成悬挂步骤。
            if self._stop_event.is_set():
                raise
            await self._handle_step_error(
                step_id=step_id,
                message=str(exc) or "step cancelled",
                retryable=False,
                trigger_followup_wake=trigger_followup_wake,
            )
        except PipelineExecutionError as exc:
            await self._handle_step_error(
                step_id=step_id,
                message=str(exc),
                retryable=exc.retryable,
                trigger_followup_wake=trigger_followup_wake,
            )
        except Exception as exc:
            logger.exception("pipeline_step_failed", step_id=step_id)
            # 未分类异常默认直接失败，只有显式声明的步骤错误才进入自动重试。
            await self._handle_step_error(
                step_id=step_id,
                message=str(exc),
                retryable=False,
                trigger_followup_wake=trigger_followup_wake,
            )

    async def _handle_step_success(
        self,
        *,
        step_id: str,
        output: dict[str, Any],
        trigger_followup_wake: bool,
    ) -> None:
        """处理步骤成功后的持久化和推进。"""
        with self.session_factory() as db:
            step = pipeline_repository.mark_step_succeeded(
                db=db,
                step_id=step_id,
                output_payload=output,
                external_ref=output.get("external_ref") if isinstance(output.get("external_ref"), dict) else None,
            )
            run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).first()
            if run is None:
                return
            steps = pipeline_repository.list_steps(db=db, run_id=run.id)
            next_step = next((item for item in steps if item.step_order > step.step_order), None)
            if next_step is None:
                pipeline_repository.mark_run_succeeded(
                    db=db,
                    run_id=run.id,
                    output_payload=output.get("run_output") if isinstance(output.get("run_output"), dict) else output,
                    resource_type=output.get("resource_type"),
                    resource_id=output.get("resource_id"),
                )
                return
            run.current_step = next_step.step_name
            run.status = "queued"
            run.error_message = None
            db.commit()
        if trigger_followup_wake:
            self.wake_up()

    async def _handle_step_error(
        self,
        *,
        step_id: str,
        message: str,
        retryable: bool,
        trigger_followup_wake: bool,
    ) -> None:
        """处理步骤失败、等待重试或终止。"""
        with self.session_factory() as db:
            step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).first()
            if step is None:
                return
            if retryable and pipeline_repository.step_has_remaining_attempts(step):
                retry_delay = max(1, (2 ** step.attempt_count) - 1)
                pipeline_repository.mark_step_waiting_retry(
                    db=db,
                    step_id=step_id,
                    error_message=message,
                    retry_delay_seconds=retry_delay,
                )
            else:
                pipeline_repository.mark_step_failed(db=db, step_id=step_id, error_message=message)
        if trigger_followup_wake:
            self.wake_up()


class PipelineRecoveryService:
    """封装流水线重试入口。"""

    def __init__(self, *, session_factory: sessionmaker[Session], dispatcher: PipelineDispatcher) -> None:
        self.session_factory = session_factory
        self.dispatcher = dispatcher

    async def retry_run(self, *, user_id: str, run_id: str, strategy: str) -> PipelineRun:
        """重置失败流水线并重新唤醒 worker。"""
        with self.session_factory() as db:
            run = pipeline_repository.retry_run(db=db, user_id=user_id, run_id=run_id, strategy=strategy)
        self.dispatcher.wake_up()
        return run
