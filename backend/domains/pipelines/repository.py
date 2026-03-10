"""Data access helpers for persistent pipelines."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from models import PipelineRun, PipelineStepRun


def _utc_now() -> datetime:
    """返回带时区的当前 UTC 时间。"""
    return datetime.now(timezone.utc)


def _dump_json(payload: dict[str, Any] | None) -> str | None:
    """将字典稳定序列化为 JSON 文本。"""
    if payload is None:
        return None
    return json.dumps(payload, ensure_ascii=False)


def _load_json(payload_json: str | None) -> dict[str, Any]:
    """将 JSON 文本解析为字典。"""
    if not payload_json:
        return {}
    try:
        parsed = json.loads(payload_json)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def create_run(
    db: Session,
    *,
    run_id: str | None,
    user_id: str,
    pipeline_type: str,
    input_payload: dict[str, Any] | None,
    resource_type: str | None,
    resource_id: str | None,
    steps: list[dict[str, Any]],
) -> PipelineRun:
    """创建流水线及其步骤定义。"""
    run = PipelineRun(
        id=run_id,
        user_id=user_id,
        pipeline_type=pipeline_type,
        status="queued",
        input_payload_json=_dump_json(input_payload),
        resource_type=resource_type,
        resource_id=resource_id,
        current_step=steps[0]["step_name"] if steps else None,
    )
    db.add(run)
    db.flush()
    for index, step in enumerate(steps):
        db.add(
            PipelineStepRun(
                pipeline_run_id=run.id,
                step_name=step["step_name"],
                step_order=index,
                status="pending",
                max_attempts=int(step.get("max_attempts", 3)),
                input_payload_json=_dump_json(step.get("input_payload")),
                available_at=_utc_now(),
            )
        )
    db.commit()
    return get_by_id(db=db, user_id=user_id, run_id=run.id)  # type: ignore[return-value]


def get_by_id(db: Session, *, user_id: str, run_id: str) -> PipelineRun | None:
    """按用户读取单条流水线。"""
    return (
        db.query(PipelineRun)
        .options(joinedload(PipelineRun.steps))
        .filter(PipelineRun.id == run_id, PipelineRun.user_id == user_id)
        .first()
    )


def get_latest_run_by_resource(
    db: Session,
    *,
    user_id: str,
    pipeline_type: str,
    resource_type: str,
    resource_id: str,
) -> PipelineRun | None:
    """按资源定位最近一次相关流水线。"""
    return (
        db.query(PipelineRun)
        .options(joinedload(PipelineRun.steps))
        .filter(
            PipelineRun.user_id == user_id,
            PipelineRun.pipeline_type == pipeline_type,
            PipelineRun.resource_type == resource_type,
            PipelineRun.resource_id == resource_id,
        )
        .order_by(PipelineRun.created_at.desc())
        .first()
    )


def get_latest_run_by_type_in_window(
    db: Session,
    *,
    user_id: str,
    pipeline_type: str,
    start_at: datetime,
    end_at: datetime,
    statuses: list[str] | None = None,
) -> PipelineRun | None:
    """按用户、类型和时间窗口读取最近一条流水线。"""
    query = (
        db.query(PipelineRun)
        .options(joinedload(PipelineRun.steps))
        .filter(
            PipelineRun.user_id == user_id,
            PipelineRun.pipeline_type == pipeline_type,
            PipelineRun.created_at >= start_at,
            PipelineRun.created_at < end_at,
        )
    )
    if statuses:
        query = query.filter(PipelineRun.status.in_(statuses))
    return query.order_by(PipelineRun.created_at.desc()).first()


def get_by_id_for_update(db: Session, *, run_id: str) -> PipelineRun | None:
    """读取并锁定一条流水线。"""
    run = (
        db.query(PipelineRun)
        .filter(PipelineRun.id == run_id)
        .with_for_update()
        .first()
    )
    if run is not None:
        # 中文注释：PostgreSQL 不允许在 nullable outer join 结果上直接 FOR UPDATE，步骤改为二次查询预加载。
        run.steps  # noqa: B018
    return run


def list_steps(db: Session, *, run_id: str) -> list[PipelineStepRun]:
    """返回流水线的步骤列表。"""
    return (
        db.query(PipelineStepRun)
        .filter(PipelineStepRun.pipeline_run_id == run_id)
        .order_by(PipelineStepRun.step_order.asc())
        .all()
    )


def claim_next_runnable_step(
    db: Session,
    *,
    worker_id: str,
    run_id: str | None = None,
    now: datetime | None = None,
) -> PipelineStepRun | None:
    """抢占一条可以执行的步骤。"""
    current_time = now or _utc_now()
    filters = [
        PipelineRun.status.in_(["queued", "running"]),
        PipelineRun.current_step == PipelineStepRun.step_name,
        PipelineStepRun.status.in_(["pending", "waiting_retry"]),
        or_(PipelineStepRun.available_at.is_(None), PipelineStepRun.available_at <= current_time),
    ]
    if run_id is not None:
        filters.append(PipelineRun.id == run_id)
    step = (
        db.query(PipelineStepRun)
        .join(PipelineRun, PipelineRun.id == PipelineStepRun.pipeline_run_id)
        .filter(*filters)
        .order_by(PipelineRun.created_at.asc(), PipelineStepRun.step_order.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if not step:
        return None
    step.status = "running"
    step.attempt_count += 1
    step.lock_token = worker_id
    step.locked_at = current_time
    step.started_at = current_time
    step.error_message = None
    run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).with_for_update().first()
    if run:
        run.status = "running"
        run.current_step = step.step_name
        run.error_message = None
        run.next_retry_at = None
    db.commit()
    db.refresh(step)
    return step


def mark_step_succeeded(
    db: Session,
    *,
    step_id: str,
    output_payload: dict[str, Any] | None,
    external_ref: dict[str, Any] | None = None,
) -> PipelineStepRun:
    """标记步骤成功并写入结果。"""
    step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"pipeline step not found: {step_id}")
    step.status = "succeeded"
    step.output_payload_json = _dump_json(output_payload)
    step.external_ref_json = _dump_json(external_ref)
    step.finished_at = _utc_now()
    step.lock_token = None
    step.locked_at = None
    db.commit()
    db.refresh(step)
    return step


def mark_step_waiting_retry(
    db: Session,
    *,
    step_id: str,
    error_message: str,
    retry_delay_seconds: int,
) -> PipelineStepRun:
    """标记步骤等待重试。"""
    step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"pipeline step not found: {step_id}")
    step.status = "waiting_retry"
    step.error_message = error_message
    step.finished_at = _utc_now()
    step.available_at = _utc_now() + timedelta(seconds=max(0, retry_delay_seconds))
    step.lock_token = None
    step.locked_at = None
    run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).with_for_update().first()
    if run:
        run.status = "queued"
        run.error_message = error_message
        run.next_retry_at = step.available_at
    db.commit()
    db.refresh(step)
    return step


def mark_step_failed(db: Session, *, step_id: str, error_message: str) -> PipelineStepRun:
    """标记步骤和流水线失败。"""
    step = db.query(PipelineStepRun).filter(PipelineStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"pipeline step not found: {step_id}")
    step.status = "failed"
    step.error_message = error_message
    step.finished_at = _utc_now()
    step.lock_token = None
    step.locked_at = None
    run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).with_for_update().first()
    if run:
        run.status = "failed"
        run.error_message = error_message
        run.finished_at = _utc_now()
        run.next_retry_at = None
        run.current_step = step.step_name
    db.commit()
    db.refresh(step)
    return step


def mark_run_succeeded(
    db: Session,
    *,
    run_id: str,
    output_payload: dict[str, Any] | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> PipelineRun:
    """标记流水线成功完成。"""
    run = db.query(PipelineRun).filter(PipelineRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"pipeline run not found: {run_id}")
    run.status = "succeeded"
    run.error_message = None
    run.finished_at = _utc_now()
    run.current_step = None
    run.next_retry_at = None
    if output_payload is not None:
        run.output_payload_json = _dump_json(output_payload)
    if resource_type is not None:
        run.resource_type = resource_type
    if resource_id is not None:
        run.resource_id = resource_id
    db.commit()
    db.refresh(run)
    return run


def update_run_resource(
    db: Session,
    *,
    run_id: str,
    resource_type: str | None,
    resource_id: str | None,
    output_payload: dict[str, Any] | None = None,
) -> PipelineRun:
    """更新流水线当前资源引用。"""
    run = db.query(PipelineRun).filter(PipelineRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"pipeline run not found: {run_id}")
    run.resource_type = resource_type
    run.resource_id = resource_id
    if output_payload is not None:
        run.output_payload_json = _dump_json(output_payload)
    db.commit()
    db.refresh(run)
    return run


def get_step_payloads(db: Session, *, run_id: str) -> dict[str, dict[str, Any]]:
    """读取该 run 所有步骤产出。"""
    steps = list_steps(db=db, run_id=run_id)
    return {step.step_name: _load_json(step.output_payload_json) for step in steps}


def recover_stale_steps(db: Session, *, stale_seconds: int, now: datetime | None = None) -> int:
    """回收长时间未释放锁的运行中步骤。"""
    current_time = now or _utc_now()
    threshold = current_time - timedelta(seconds=max(1, stale_seconds))
    steps = (
        db.query(PipelineStepRun)
        .filter(
            PipelineStepRun.status == "running",
            PipelineStepRun.locked_at.isnot(None),
            PipelineStepRun.locked_at < threshold,
        )
        .all()
    )
    for step in steps:
        step.status = "waiting_retry" if step.attempt_count < step.max_attempts else "failed"
        step.error_message = step.error_message or "step lock expired"
        step.available_at = current_time
        step.lock_token = None
        step.locked_at = None
        run = db.query(PipelineRun).filter(PipelineRun.id == step.pipeline_run_id).first()
        if run:
            run.status = "queued" if step.status == "waiting_retry" else "failed"
            run.error_message = step.error_message
            run.current_step = step.step_name
            run.next_retry_at = current_time if step.status == "waiting_retry" else None
    db.commit()
    return len(steps)


def retry_run(db: Session, *, user_id: str, run_id: str, strategy: str) -> PipelineRun:
    """重置失败流水线供重新执行。"""
    run = get_by_id_for_update(db=db, run_id=run_id)
    if run is None or run.user_id != user_id:
        raise RuntimeError(f"pipeline run not found: {run_id}")
    steps = sorted(run.steps, key=lambda item: item.step_order)
    reset_from = 0
    if strategy == "from_failed_step":
        reset_from = next((step.step_order for step in steps if step.status == "failed"), 0)
    for step in steps:
        if step.step_order < reset_from:
            continue
        step.status = "pending"
        step.error_message = None
        step.available_at = _utc_now()
        step.finished_at = None
        step.lock_token = None
        step.locked_at = None
        if strategy == "from_start":
            step.output_payload_json = None
            step.external_ref_json = None
            step.attempt_count = 0
    run.status = "queued"
    run.error_message = None
    run.finished_at = None
    run.current_step = steps[reset_from].step_name if steps else None
    run.next_retry_at = _utc_now()
    db.commit()
    return get_by_id(db=db, user_id=user_id, run_id=run_id)  # type: ignore[return-value]


def step_has_remaining_attempts(step: PipelineStepRun) -> bool:
    """判断步骤是否还能继续自动重试。"""
    return step.attempt_count < step.max_attempts


def load_json(payload_json: str | None) -> dict[str, Any]:
    """向业务层暴露 JSON 解析工具。"""
    return _load_json(payload_json)
