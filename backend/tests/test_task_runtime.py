"""Celery 任务运行时测试。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from celery import Celery

from domains.tasks import repository as task_repository
from modules.shared.tasks.runtime import (
    RETRY_STRATEGY_FROM_FAILED_STEP,
    RETRY_STRATEGY_FROM_START,
    TaskDefinitionRegistry,
    TaskDispatchController,
    TaskRecoveryService,
    TaskRunner,
)
from modules.shared.tasks.task_types import TaskStepDefinition

pytestmark = pytest.mark.integration


def _build_runtime(db_session_factory, *, dispatcher: TaskDispatchController | None = None) -> tuple[TaskDefinitionRegistry, Celery, TaskRunner, TaskRecoveryService]:
    """构造只包含测试任务定义的运行时组件。"""
    definition_registry = TaskDefinitionRegistry()
    definition_registry.register(
        "test_task",
        [
            TaskStepDefinition(step_name="step_a", executor=None, max_attempts=2, queue="unit-test"),
            TaskStepDefinition(step_name="step_b", executor=None, max_attempts=3, queue="unit-test"),
        ],
    )
    celery_app = Celery("test-task-runtime", broker="memory://", backend="cache+memory://")
    runner = TaskRunner(
        session_factory=db_session_factory,
        definition_registry=definition_registry,
        celery_app=celery_app,
        dispatcher=dispatcher,
    )
    recovery_service = TaskRecoveryService(
        session_factory=db_session_factory,
        definition_registry=definition_registry,
        celery_app=celery_app,
        dispatcher=dispatcher,
    )
    return definition_registry, celery_app, runner, recovery_service


@pytest.mark.asyncio
async def test_task_runner_dispatches_first_step_when_enabled(db_session_factory, monkeypatch) -> None:
    """创建任务时应投递首个步骤并回写 celery_root_id。"""
    dispatcher = TaskDispatchController()
    _, celery_app, runner, _ = _build_runtime(db_session_factory, dispatcher=dispatcher)
    captured: dict[str, str | None] = {}

    def _capture_enqueue(*, celery_app, task_run_id, task_type, step_name, queue=None):
        captured.update(
            celery_app_name=celery_app.main,
            task_run_id=task_run_id,
            task_type=task_type,
            step_name=step_name,
            queue=queue,
        )
        return SimpleNamespace(id="celery-root-001")

    monkeypatch.setattr("modules.shared.celery.tasks.enqueue_task_step", _capture_enqueue)

    run = await runner.create_run(
        run_id="task-run-001",
        user_id="test-user-001",
        task_type="test_task",
        input_payload={"source": "unit-test"},
        resource_type=None,
        resource_id=None,
    )

    assert captured == {
        "celery_app_name": celery_app.main,
        "task_run_id": "task-run-001",
        "task_type": "test_task",
        "step_name": "step_a",
        "queue": "unit-test",
    }
    assert run.id == "task-run-001"
    assert run.task_type == "test_task"
    assert run.current_step == "step_a"
    assert run.celery_root_id == "celery-root-001"


@pytest.mark.asyncio
async def test_task_runner_skips_dispatch_when_paused(db_session_factory, monkeypatch) -> None:
    """暂停自动投递时应只创建任务记录。"""
    dispatcher = TaskDispatchController()
    await dispatcher.stop()
    _, _, runner, _ = _build_runtime(db_session_factory, dispatcher=dispatcher)

    def _unexpected_enqueue(**kwargs):
        raise AssertionError("paused dispatcher should not enqueue")

    monkeypatch.setattr("modules.shared.celery.tasks.enqueue_task_step", _unexpected_enqueue)

    run = await runner.create_run(
        run_id="task-run-002",
        user_id="test-user-001",
        task_type="test_task",
        input_payload=None,
        resource_type=None,
        resource_id=None,
    )

    assert run.id == "task-run-002"
    assert run.current_step == "step_a"
    assert run.celery_root_id is None


@pytest.mark.asyncio
async def test_task_recovery_restarts_from_failed_step(db_session_factory, monkeypatch) -> None:
    """从失败步骤重试时应只重置失败步及之后的状态。"""
    dispatcher = TaskDispatchController()
    _, _, runner, recovery_service = _build_runtime(db_session_factory, dispatcher=dispatcher)

    monkeypatch.setattr(
        "modules.shared.celery.tasks.enqueue_task_step",
        lambda **kwargs: SimpleNamespace(id="celery-root-initial"),
    )
    await runner.create_run(
        run_id="task-run-003",
        user_id="test-user-001",
        task_type="test_task",
        input_payload=None,
        resource_type=None,
        resource_id=None,
    )

    with db_session_factory() as db:
        steps = task_repository.list_steps(db=db, run_id="task-run-003")
        step_a, step_b = steps
        task_repository.mark_step_started(db=db, step_id=step_a.id, celery_task_id="step-a-1")
        task_repository.mark_step_succeeded(db=db, step_id=step_a.id, output_payload={"ok": True})
        task_repository.mark_step_started(db=db, step_id=step_b.id, celery_task_id="step-b-1")
        task_repository.mark_step_failed(db=db, step_id=step_b.id, error_message="boom")
        task_repository.mark_run_failed(
            db=db,
            run_id="task-run-003",
            current_step="step_b",
            error_message="boom",
        )

    captured: dict[str, str | None] = {}

    def _capture_enqueue(*, celery_app, task_run_id, task_type, step_name, queue=None):
        captured.update(task_run_id=task_run_id, task_type=task_type, step_name=step_name, queue=queue)
        return SimpleNamespace(id="celery-root-retry")

    monkeypatch.setattr("modules.shared.celery.tasks.enqueue_task_step", _capture_enqueue)

    run = await recovery_service.retry_run(
        user_id="test-user-001",
        run_id="task-run-003",
        strategy=RETRY_STRATEGY_FROM_FAILED_STEP,
    )

    assert captured == {
        "task_run_id": "task-run-003",
        "task_type": "test_task",
        "step_name": "step_b",
        "queue": "unit-test",
    }
    assert run.status == "queued"
    assert run.current_step == "step_b"
    assert run.celery_root_id == "celery-root-retry"
    refreshed_steps = sorted(run.steps, key=lambda item: item.step_order)
    assert refreshed_steps[0].status == "succeeded"
    assert refreshed_steps[0].attempt_count == 1
    assert refreshed_steps[1].status == "pending"
    assert refreshed_steps[1].attempt_count == 0


@pytest.mark.asyncio
async def test_task_recovery_restarts_from_start(db_session_factory, monkeypatch) -> None:
    """从头重试时应把所有步骤重置并投递第一步。"""
    dispatcher = TaskDispatchController()
    _, _, runner, recovery_service = _build_runtime(db_session_factory, dispatcher=dispatcher)

    monkeypatch.setattr(
        "modules.shared.celery.tasks.enqueue_task_step",
        lambda **kwargs: SimpleNamespace(id="celery-root-initial"),
    )
    await runner.create_run(
        run_id="task-run-004",
        user_id="test-user-001",
        task_type="test_task",
        input_payload=None,
        resource_type=None,
        resource_id=None,
    )

    with db_session_factory() as db:
        steps = task_repository.list_steps(db=db, run_id="task-run-004")
        step_a, step_b = steps
        task_repository.mark_step_started(db=db, step_id=step_a.id, celery_task_id="step-a-1")
        task_repository.mark_step_succeeded(db=db, step_id=step_a.id, output_payload={"ok": True})
        task_repository.mark_step_started(db=db, step_id=step_b.id, celery_task_id="step-b-1")
        task_repository.mark_step_failed(db=db, step_id=step_b.id, error_message="boom")
        task_repository.mark_run_failed(
            db=db,
            run_id="task-run-004",
            current_step="step_b",
            error_message="boom",
        )

    captured: dict[str, str | None] = {}

    def _capture_enqueue(*, celery_app, task_run_id, task_type, step_name, queue=None):
        captured.update(task_run_id=task_run_id, task_type=task_type, step_name=step_name, queue=queue)
        return SimpleNamespace(id="celery-root-retry")

    monkeypatch.setattr("modules.shared.celery.tasks.enqueue_task_step", _capture_enqueue)

    run = await recovery_service.retry_run(
        user_id="test-user-001",
        run_id="task-run-004",
        strategy=RETRY_STRATEGY_FROM_START,
    )

    assert captured == {
        "task_run_id": "task-run-004",
        "task_type": "test_task",
        "step_name": "step_a",
        "queue": "unit-test",
    }
    assert run.status == "queued"
    assert run.current_step == "step_a"
    assert run.celery_root_id == "celery-root-retry"
    refreshed_steps = sorted(run.steps, key=lambda item: item.step_order)
    assert refreshed_steps[0].status == "pending"
    assert refreshed_steps[0].attempt_count == 0
    assert refreshed_steps[1].status == "pending"
    assert refreshed_steps[1].attempt_count == 0
