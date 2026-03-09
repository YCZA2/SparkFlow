"""持久化流水线运行时测试。"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from domains.pipelines import repository as pipeline_repository
from models import Fragment, PipelineRun, PipelineStepRun
from modules.shared.pipeline_runtime import (
    PipelineDefinitionRegistry,
    PipelineDispatcher,
    PipelineExecutionError,
    PipelineStepDefinition,
    StepExecutorRegistry,
)


def _build_dispatcher(
    db_session_factory,
    executor,
    *,
    worker_poll_interval: float = 0.01,
    max_attempts: int = 1,
) -> PipelineDispatcher:
    """构造只包含单一步骤的 dispatcher，便于验证取消和停机行为。"""
    definition_registry = PipelineDefinitionRegistry()
    executor_registry = StepExecutorRegistry()
    definition = PipelineStepDefinition(step_name="test_step", executor=executor, max_attempts=max_attempts)
    definition_registry.register("test_pipeline", [definition])
    executor_registry.register("test_pipeline", definition)
    return PipelineDispatcher(
        session_factory=db_session_factory,
        container=object(),
        definition_registry=definition_registry,
        executor_registry=executor_registry,
        worker_poll_interval=worker_poll_interval,
    )


def _create_test_run(db_session_factory, *, max_attempts: int = 1) -> None:
    """创建一个待执行的测试流水线。"""
    with db_session_factory() as db:
        pipeline_repository.create_run(
            db=db,
            run_id="test-run-001",
            user_id="test-user-001",
            pipeline_type="test_pipeline",
            input_payload={},
            resource_type=None,
            resource_id=None,
            steps=[{"step_name": "test_step", "max_attempts": max_attempts, "input_payload": None}],
        )


def _claim_test_step(db_session_factory) -> str:
    """手动抢占测试步骤，便于直接驱动单步执行分支。"""
    with db_session_factory() as db:
        step = pipeline_repository.claim_next_runnable_step(db=db, worker_id="test-worker")
        assert step is not None
        return step.id


def _create_failed_two_step_run(db_session_factory, *, run_id: str) -> None:
    """创建一条带失败步骤的双步骤流水线，供重试策略测试。"""
    with db_session_factory() as db:
        pipeline_repository.create_run(
            db=db,
            run_id=run_id,
            user_id="test-user-001",
            pipeline_type="test_pipeline",
            input_payload={},
            resource_type=None,
            resource_id=None,
            steps=[
                {"step_name": "step_a", "max_attempts": 2, "input_payload": None},
                {"step_name": "step_b", "max_attempts": 3, "input_payload": None},
            ],
        )
        steps = pipeline_repository.list_steps(db=db, run_id=run_id)
        steps[0].status = "succeeded"
        steps[0].attempt_count = 1
        steps[0].output_payload_json = '{"ok": true}'
        steps[1].status = "failed"
        steps[1].attempt_count = 2
        steps[1].output_payload_json = '{"stage": "failed"}'
        run = db.query(PipelineRun).filter_by(id=run_id).first()
        assert run is not None
        run.status = "failed"
        run.current_step = "step_b"
        run.error_message = "step_b failed"
        db.commit()


@pytest.mark.asyncio
async def test_dispatcher_marks_cancelled_executor_as_failed(db_session_factory) -> None:
    """业务执行阶段抛出的取消异常应被收敛为失败态。"""

    async def _cancelled_executor(context) -> dict:
        raise asyncio.CancelledError()

    dispatcher = _build_dispatcher(db_session_factory, _cancelled_executor)
    _create_test_run(db_session_factory, max_attempts=2)
    step_id = _claim_test_step(db_session_factory)

    try:
        await dispatcher._execute_step(step_id=step_id)

        with db_session_factory() as db:
            step = db.query(PipelineStepRun).filter_by(id=step_id).first()
            run = db.query(PipelineRun).filter_by(id="test-run-001").first()
            assert step is not None
            assert run is not None
            assert step.status == "failed"
            assert run.status == "failed"
    finally:
        await dispatcher.stop()


@pytest.mark.asyncio
async def test_dispatcher_claims_runnable_step_and_completes_run(db_session_factory) -> None:
    """可运行步骤应被正确抢占并推进到成功终态。"""

    async def _success_executor(context) -> dict:
        return {"done": True}

    dispatcher = _build_dispatcher(db_session_factory, _success_executor)
    _create_test_run(db_session_factory)

    progressed = await dispatcher.run_once()

    assert progressed is True
    with db_session_factory() as db:
        step = db.query(PipelineStepRun).filter_by(pipeline_run_id="test-run-001").first()
        run = db.query(PipelineRun).filter_by(id="test-run-001").first()
        assert step is not None
        assert run is not None
        assert step.status == "succeeded"
        assert step.attempt_count == 1
        assert run.status == "succeeded"


@pytest.mark.asyncio
async def test_dispatcher_retries_retryable_step_and_then_succeeds(db_session_factory) -> None:
    """可重试错误应先进入 waiting_retry，再在下次执行时成功。"""
    state = {"attempts": 0}

    async def _retryable_executor(context) -> dict:
        state["attempts"] += 1
        if state["attempts"] == 1:
            raise PipelineExecutionError("temporary failure", retryable=True)
        return {"done": True}

    dispatcher = _build_dispatcher(db_session_factory, _retryable_executor, max_attempts=2)
    _create_test_run(db_session_factory, max_attempts=2)

    try:
        first_progress = await dispatcher.run_once()
        assert first_progress is True
        with db_session_factory() as db:
            step = db.query(PipelineStepRun).filter_by(pipeline_run_id="test-run-001").first()
            run = db.query(PipelineRun).filter_by(id="test-run-001").first()
            assert step is not None
            assert run is not None
            assert step.status == "waiting_retry"
            step.available_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()

        second_progress = await dispatcher.run_once()
        assert second_progress is True
        with db_session_factory() as db:
            step = db.query(PipelineStepRun).filter_by(pipeline_run_id="test-run-001").first()
            run = db.query(PipelineRun).filter_by(id="test-run-001").first()
            assert step is not None
            assert run is not None
            assert step.status == "succeeded"
            assert step.attempt_count == 2
            assert run.status == "succeeded"
    finally:
        await dispatcher.stop()


def test_recover_stale_steps_restores_waiting_retry_state(db_session_factory) -> None:
    """陈旧锁应被回收为 waiting_retry，并恢复 run 到可继续执行状态。"""
    _create_test_run(db_session_factory, max_attempts=2)
    step_id = _claim_test_step(db_session_factory)

    with db_session_factory() as db:
        recovered = pipeline_repository.recover_stale_steps(
            db=db,
            stale_seconds=1,
            now=datetime.now(timezone.utc) + timedelta(seconds=5),
        )
        step = db.query(PipelineStepRun).filter_by(id=step_id).first()
        run = db.query(PipelineRun).filter_by(id="test-run-001").first()
        assert recovered == 1
        assert step is not None
        assert run is not None
        assert step.status == "waiting_retry"
        assert run.status == "queued"
        assert run.current_step == step.step_name


def test_retry_run_supports_from_failed_step_and_from_start(db_session_factory) -> None:
    """重试入口应分别支持从失败步骤续跑和从起点重跑。"""
    _create_failed_two_step_run(db_session_factory, run_id="failed-run-step")
    with db_session_factory() as db:
        retried = pipeline_repository.retry_run(
            db=db,
            user_id="test-user-001",
            run_id="failed-run-step",
            strategy="from_failed_step",
        )
        steps = pipeline_repository.list_steps(db=db, run_id="failed-run-step")
        assert retried.status == "queued"
        assert retried.current_step == "step_b"
        assert steps[0].status == "succeeded"
        assert steps[0].output_payload_json == '{"ok": true}'
        assert steps[1].status == "pending"
        assert steps[1].output_payload_json == '{"stage": "failed"}'
        assert steps[1].attempt_count == 2

    _create_failed_two_step_run(db_session_factory, run_id="failed-run-start")
    with db_session_factory() as db:
        retried = pipeline_repository.retry_run(
            db=db,
            user_id="test-user-001",
            run_id="failed-run-start",
            strategy="from_start",
        )
        steps = pipeline_repository.list_steps(db=db, run_id="failed-run-start")
        assert retried.status == "queued"
        assert retried.current_step == "step_a"
        assert steps[0].status == "pending"
        assert steps[0].output_payload_json is None
        assert steps[0].attempt_count == 0
        assert steps[1].status == "pending"
        assert steps[1].output_payload_json is None
        assert steps[1].attempt_count == 0

@pytest.mark.asyncio
async def test_dispatcher_stop_handles_shutdown_cancellation(db_session_factory) -> None:
    """停机时取消长任务不应把取消异常继续抛给调用方。"""

    dispatcher = _build_dispatcher(db_session_factory, lambda context: asyncio.sleep(0))
    task = asyncio.create_task(asyncio.Event().wait())
    dispatcher._task = task
    assert task is not None
    await dispatcher.stop()
    await asyncio.sleep(0)

    assert dispatcher._task is None
    assert task.done()
