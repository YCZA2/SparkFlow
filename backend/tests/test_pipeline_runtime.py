"""持久化流水线运行时测试。"""

from __future__ import annotations

import asyncio

import pytest

from domains.pipelines import repository as pipeline_repository
from models import PipelineRun, PipelineStepRun
from modules.shared.pipeline_runtime import PipelineDefinitionRegistry, PipelineDispatcher, PipelineStepDefinition, StepExecutorRegistry


def _build_dispatcher(db_session_factory, executor, *, worker_poll_interval: float = 0.01) -> PipelineDispatcher:
    """构造只包含单一步骤的 dispatcher，便于验证取消和停机行为。"""
    definition_registry = PipelineDefinitionRegistry()
    executor_registry = StepExecutorRegistry()
    definition = PipelineStepDefinition(step_name="test_step", executor=executor, max_attempts=1)
    definition_registry.register("test_pipeline", [definition])
    executor_registry.register("test_pipeline", definition)
    return PipelineDispatcher(
        session_factory=db_session_factory,
        container=object(),
        definition_registry=definition_registry,
        executor_registry=executor_registry,
        worker_poll_interval=worker_poll_interval,
    )


def _create_test_run(db_session_factory) -> None:
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
            steps=[{"step_name": "test_step", "max_attempts": 1, "input_payload": None}],
        )


def _claim_test_step(db_session_factory) -> str:
    """手动抢占测试步骤，便于直接驱动单步执行分支。"""
    with db_session_factory() as db:
        step = pipeline_repository.claim_next_runnable_step(db=db, worker_id="test-worker")
        assert step is not None
        return step.id


@pytest.mark.asyncio
async def test_dispatcher_marks_cancelled_executor_as_failed(db_session_factory) -> None:
    """业务执行阶段抛出的取消异常应被收敛为失败态。"""

    async def _cancelled_executor(context) -> dict:
        raise asyncio.CancelledError()

    dispatcher = _build_dispatcher(db_session_factory, _cancelled_executor)
    _create_test_run(db_session_factory)
    step_id = _claim_test_step(db_session_factory)

    await dispatcher._execute_step(step_id=step_id)

    with db_session_factory() as db:
        step = db.query(PipelineStepRun).filter_by(id=step_id).first()
        run = db.query(PipelineRun).filter_by(id="test-run-001").first()
        assert step is not None
        assert run is not None
        assert step.status == "failed"
        assert run.status == "failed"


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
