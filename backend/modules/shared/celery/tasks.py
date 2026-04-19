from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from typing import Any

from celery import Celery
from celery.result import AsyncResult

from core.logging_config import get_logger
from domains.tasks import repository as task_repository
from models import TaskRun, TaskStepRun
from modules.scripts.application import DailyPushUseCase
from modules.scripts.daily_push_task import build_daily_push_task_service
from modules.scripts.writing_context_builder import refresh_fragment_methodology_entries_for_all_users
from modules.shared.tasks.state import ensure_task_runtime
from modules.shared.tasks.task_types import TaskExecutionContext, TaskExecutionError

logger = get_logger(__name__)

TASK_QUEUE_BY_TYPE: dict[str, str] = {
    "media_ingestion": "transcription",
    "fragment_derivative_backfill": "fragment-derivative",
    "document_import": "document-import",
    "rag_script_generation": "script-generation",
    "reference_script_processing": "knowledge-processing",
    "daily_push_generation": "daily-push",
}


def resolve_task_queue(task_type: str, queue: str | None = None) -> str:
    """解析任务所属队列。"""
    return queue or TASK_QUEUE_BY_TYPE.get(task_type, "default")


def enqueue_task_step(
    *,
    celery_app: Celery,
    task_run_id: str,
    task_type: str,
    step_name: str,
    queue: str | None = None,
) -> AsyncResult:
    """投递单个任务步骤到 Celery。"""
    registered_task = celery_app.tasks["sparkflow.execute_task_step"]
    return registered_task.apply_async(
        kwargs={
            "task_run_id": task_run_id,
            "task_type": task_type,
            "step_name": step_name,
        },
        queue=resolve_task_queue(task_type, queue),
    )


def _run_coroutine_blocking(awaitable):
    """在同步 Celery 任务中安全执行异步协程。"""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)
    with ThreadPoolExecutor(max_workers=1) as executor:
        return executor.submit(lambda: asyncio.run(awaitable)).result()


async def _run_external_step(*, context: TaskExecutionContext, definition) -> dict[str, Any]:
    """向 external_provider 提交步骤并轮询结果。"""
    provider = getattr(context.container, "external_provider", None)
    if provider is None:
        raise TaskExecutionError(
            f"步骤 {definition.step_name} 声明了 runner_type=external，但容器未配置 external_provider",
            retryable=False,
        )
    workflow_id = definition.external_workflow_id or definition.step_name
    run_result = await provider.submit_run(
        inputs=context.input_payload,
        user_id=context.run.user_id,
    )
    poll_interval = 1.0
    deadline = asyncio.get_running_loop().time() + 30
    while run_result.status in ("queued", "running"):
        if asyncio.get_running_loop().time() >= deadline:
            raise TaskExecutionError(
                f"外部工作流轮询超时: {workflow_id}",
                retryable=True,
            )
        await asyncio.sleep(poll_interval)
        run_result = await provider.get_run(run_id=run_result.run_id)
        poll_interval = min(poll_interval * 1.5, 10.0)
    if run_result.status == "failed":
        raise TaskExecutionError(f"外部工作流执行失败: {workflow_id}", retryable=True)
    return run_result.outputs


async def _execute_task_step_async(
    *,
    celery_app: Celery,
    celery_task_id: str | None,
    task_run_id: str,
    task_type: str,
    step_name: str,
) -> dict[str, Any]:
    """执行单个任务步骤，并投递后续步骤。"""
    runtime = ensure_task_runtime()
    container = runtime.container
    definition = next(
        (item for item in runtime.definition_registry.get(task_type) if item.step_name == step_name),
        None,
    )
    if definition is None:
        raise RuntimeError(f"missing task definition for {task_type}:{step_name}")

    session_factory = container.session_factory
    with session_factory() as db:
        run = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
        step = (
            db.query(TaskStepRun)
            .filter(TaskStepRun.task_run_id == task_run_id, TaskStepRun.step_name == step_name)
            .first()
        )
        if run is None or step is None:
            return {"status": "missing"}
        if run.status == "succeeded" or step.status == "succeeded":
            return {"status": "already_succeeded"}
        step_id = step.id
        run_user_id = run.user_id
        run_resource_id = run.resource_id
        task_repository.mark_step_started(
            db=db,
            step_id=step_id,
            celery_task_id=celery_task_id,
            auto_commit=False,
        )
        task_repository.mark_run_started(
            db=db,
            run_id=run.id,
            current_step=step.step_name,
            celery_root_id=run.celery_root_id or celery_task_id,
            auto_commit=False,
        )
        db.commit()

    try:
        with session_factory() as db:
            run = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
            step = (
                db.query(TaskStepRun)
                .filter(TaskStepRun.task_run_id == task_run_id, TaskStepRun.step_name == step_name)
                .first()
            )
            if run is None or step is None:
                return {"status": "missing_after_start"}
            step_outputs = {
                item.step_name: task_repository.load_json(item.output_payload_json)
                for item in task_repository.list_steps(db=db, run_id=run.id)
            }
            context = TaskExecutionContext(
                db=db,
                session_factory=session_factory,
                run=run,
                step=step,
                container=container,
                step_outputs=step_outputs,
            )
            if definition.runner_type == "external":
                output = await _run_external_step(context=context, definition=definition)
            else:
                executor = definition.executor
                if executor is None:
                    raise RuntimeError(f"missing executor for {task_type}:{step_name}")
                output = await executor(context) or {}
    except asyncio.CancelledError as exc:
        error_message = str(exc) or "step cancelled"
        retryable = False
        caught_error = exc
    except TaskExecutionError as exc:
        error_message = str(exc)
        retryable = exc.retryable
        caught_error = exc
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "task_step_failed",
            task_id=task_run_id,
            task_type=task_type,
            step_name=step_name,
        )
        error_message = str(exc) or "unknown error"
        retryable = False
        caught_error = exc
    else:
        with session_factory() as db:
            task_repository.mark_step_succeeded(
                db=db,
                step_id=step_id,
                output_payload=output,
                external_ref=output.get("external_ref") if isinstance(output.get("external_ref"), dict) else None,
                auto_commit=False,
            )
            current_run = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
            steps = task_repository.list_steps(db=db, run_id=task_run_id)
            current_step = next((item for item in steps if item.step_name == step_name), None)
            next_step = None
            if current_step is not None:
                next_step = next((item for item in steps if item.step_order > current_step.step_order), None)
            if next_step is None:
                task_repository.mark_run_succeeded(
                    db=db,
                    run_id=task_run_id,
                    output_payload=output.get("run_output") if isinstance(output.get("run_output"), dict) else output,
                    resource_type=output.get("resource_type"),
                    resource_id=output.get("resource_id"),
                    auto_commit=False,
                )
                db.commit()
                logger.info(
                    "task_run_succeeded",
                    task_id=task_run_id,
                    task_type=task_type,
                    step_name=step_name,
                    user_id=current_run.user_id if current_run else run_user_id,
                    resource_id=current_run.resource_id if current_run else run_resource_id,
                )
                return {"status": "succeeded"}
            next_step_name = next_step.step_name
            current_run.status = "queued"
            current_run.current_step = next_step_name
            current_run.error_message = None
            db.flush()
            db.commit()
        try:
            next_definition = next((item for item in runtime.definition_registry.get(task_type) if item.step_name == next_step_name), None)
            enqueue_task_step(
                celery_app=celery_app,
                task_run_id=task_run_id,
                task_type=task_type,
                step_name=next_step_name,
                queue=next_definition.queue if next_definition else None,
            )
        except Exception as exc:  # noqa: BLE001
            with session_factory() as db:
                task_repository.mark_run_failed(
                    db=db,
                    run_id=task_run_id,
                    current_step=next_step_name,
                    error_message=f"后续步骤投递失败: {str(exc) or 'unknown error'}",
                )
            raise
        logger.info(
            "task_step_succeeded",
            task_id=task_run_id,
            task_type=task_type,
            step_name=step_name,
            user_id=run_user_id,
            resource_id=run_resource_id,
        )
        return {"status": "step_succeeded"}

    with session_factory() as db:
        current_step = (
            db.query(TaskStepRun)
            .filter(TaskStepRun.task_run_id == task_run_id, TaskStepRun.step_name == step_name)
            .first()
        )
        current_run = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
        if current_step is None or current_run is None:
            raise caught_error
        should_retry = retryable and current_step.attempt_count < current_step.max_attempts
        current_run_user_id = current_run.user_id
        current_run_resource_id = current_run.resource_id
        current_step_attempt_count = current_step.attempt_count
        if should_retry:
            task_repository.mark_step_retrying(
                db=db,
                step_id=current_step.id,
                error_message=error_message,
                auto_commit=False,
            )
            task_repository.mark_run_retrying(
                db=db,
                run_id=current_run.id,
                current_step=step_name,
                error_message=error_message,
                auto_commit=False,
            )
            db.commit()
        else:
            task_repository.mark_step_failed(
                db=db,
                step_id=current_step.id,
                error_message=error_message,
                auto_commit=False,
            )
            task_repository.mark_run_failed(
                db=db,
                run_id=current_run.id,
                current_step=step_name,
                error_message=error_message,
                auto_commit=False,
            )
            db.commit()
    logger.warning(
        "task_step_error",
        task_id=task_run_id,
        task_type=task_type,
        step_name=step_name,
        user_id=current_run_user_id,
        resource_id=current_run_resource_id,
        error=error_message,
        retryable=retryable,
    )
    if should_retry:
        countdown = max(1, (2 ** current_step_attempt_count) - 1)
        if celery_app.conf.task_always_eager:
            enqueue_task_step(
                celery_app=celery_app,
                task_run_id=task_run_id,
                task_type=task_type,
                step_name=step_name,
                queue=definition.queue,
            )
            return {"status": "retrying"}
        raise caught_error
    raise caught_error


def register_celery_tasks(celery_app: Celery) -> None:
    """注册 SparkFlow 使用的 Celery 任务。"""
    if getattr(celery_app, "_sparkflow_tasks_registered", False):
        return

    @celery_app.task(bind=True, name="sparkflow.execute_task_step", acks_late=True)
    def execute_task_step(self, task_run_id: str, task_type: str, step_name: str):
        """执行单个任务步骤，并在需要时触发重试。"""
        try:
            return _run_coroutine_blocking(
                _execute_task_step_async(
                    celery_app=self.app,
                    celery_task_id=self.request.id,
                    task_run_id=task_run_id,
                    task_type=task_type,
                    step_name=step_name,
                )
            )
        except TaskExecutionError as exc:
            runtime = ensure_task_runtime()
            with runtime.container.session_factory() as db:
                step = (
                    db.query(TaskStepRun)
                    .filter(TaskStepRun.task_run_id == task_run_id, TaskStepRun.step_name == step_name)
                    .first()
                )
                if step is not None and exc.retryable and step.attempt_count < step.max_attempts and not self.app.conf.task_always_eager:
                    raise self.retry(exc=exc, countdown=max(1, (2 ** step.attempt_count) - 1))
            raise

    @celery_app.task(name="sparkflow.periodic.enqueue_daily_push", acks_late=True)
    def enqueue_daily_push_periodic():
        """Celery beat 触发每日推盘任务。"""
        return _run_coroutine_blocking(_enqueue_daily_push_periodic_async())

    @celery_app.task(name="sparkflow.periodic.refresh_writing_context", acks_late=True)
    def refresh_writing_context_periodic():
        """Celery beat 触发写作上下文维护任务。"""
        return _run_coroutine_blocking(_refresh_writing_context_periodic_async())

    celery_app._sparkflow_tasks_registered = True  # type: ignore[attr-defined]


async def _enqueue_daily_push_periodic_async() -> dict[str, Any]:
    """执行每日推盘定时入队任务。"""
    runtime = ensure_task_runtime()
    with runtime.container.session_factory() as db:
        use_case = DailyPushUseCase(
            pipeline_service=build_daily_push_task_service(runtime.container),
        )
        return await use_case.run_daily_job(db=db)


async def _refresh_writing_context_periodic_async() -> dict[str, Any]:
    """执行写作上下文定时维护任务。"""
    runtime = ensure_task_runtime()
    with runtime.container.session_factory() as db:
        result = await refresh_fragment_methodology_entries_for_all_users(
            db=db,
            llm_provider=runtime.container.llm_provider,
        )
        return result or {}
