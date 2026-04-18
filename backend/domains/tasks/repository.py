"""Data access helpers for Celery-backed task runs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from models import TaskRun, TaskStepRun


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
    task_type: str,
    input_payload: dict[str, Any] | None,
    resource_type: str | None,
    resource_id: str | None,
    steps: list[dict[str, Any]],
) -> TaskRun:
    """创建任务运行记录及其步骤定义。"""
    run = TaskRun(
        id=run_id,
        user_id=user_id,
        task_type=task_type,
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
            TaskStepRun(
                task_run_id=run.id,
                step_name=step["step_name"],
                step_order=index,
                status="pending",
                max_attempts=int(step.get("max_attempts", 3)),
                input_payload_json=_dump_json(step.get("input_payload")),
            )
        )
    db.commit()
    return get_by_id(db=db, user_id=user_id, run_id=run.id)  # type: ignore[return-value]


def get_by_id(db: Session, *, user_id: str, run_id: str) -> TaskRun | None:
    """按用户读取单条任务运行记录。"""
    return (
        db.query(TaskRun)
        .options(joinedload(TaskRun.steps))
        .filter(TaskRun.id == run_id, TaskRun.user_id == user_id)
        .first()
    )


def get_by_id_for_update(db: Session, *, run_id: str) -> TaskRun | None:
    """读取并锁定一条任务运行记录。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is not None:
        run.steps  # noqa: B018
    return run


def list_steps(db: Session, *, run_id: str) -> list[TaskStepRun]:
    """返回任务的步骤列表。"""
    return (
        db.query(TaskStepRun)
        .filter(TaskStepRun.task_run_id == run_id)
        .order_by(TaskStepRun.step_order.asc())
        .all()
    )


def get_latest_run_by_resource(
    db: Session,
    *,
    user_id: str,
    task_type: str,
    resource_type: str,
    resource_id: str,
) -> TaskRun | None:
    """按资源定位最近一次相关任务。"""
    return (
        db.query(TaskRun)
        .options(joinedload(TaskRun.steps))
        .filter(
            TaskRun.user_id == user_id,
            TaskRun.task_type == task_type,
            TaskRun.resource_type == resource_type,
            TaskRun.resource_id == resource_id,
        )
        .order_by(TaskRun.created_at.desc())
        .first()
    )


def get_latest_run_by_type_in_window(
    db: Session,
    *,
    user_id: str,
    task_type: str,
    start_at: datetime,
    end_at: datetime,
    statuses: list[str] | None = None,
) -> TaskRun | None:
    """按用户、类型和时间窗口读取最近一条任务。"""
    query = (
        db.query(TaskRun)
        .options(joinedload(TaskRun.steps))
        .filter(
            TaskRun.user_id == user_id,
            TaskRun.task_type == task_type,
            TaskRun.created_at >= start_at,
            TaskRun.created_at < end_at,
        )
    )
    if statuses:
        query = query.filter(TaskRun.status.in_(statuses))
    return query.order_by(TaskRun.created_at.desc()).first()


def set_run_celery_root_id(
    db: Session,
    *,
    run_id: str,
    celery_root_id: str | None,
    auto_commit: bool = True,
) -> TaskRun:
    """回写任务根 Celery ID。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.celery_root_id = celery_root_id
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def mark_run_started(
    db: Session,
    *,
    run_id: str,
    current_step: str,
    celery_root_id: str | None = None,
    auto_commit: bool = True,
) -> TaskRun:
    """标记任务开始执行。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.status = "running"
    run.current_step = current_step
    run.error_message = None
    if celery_root_id:
        run.celery_root_id = celery_root_id
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def mark_run_retrying(
    db: Session,
    *,
    run_id: str,
    current_step: str,
    error_message: str,
    auto_commit: bool = True,
) -> TaskRun:
    """标记任务正在等待自动重试。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.status = "retrying"
    run.current_step = current_step
    run.error_message = error_message
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def mark_run_failed(
    db: Session,
    *,
    run_id: str,
    current_step: str,
    error_message: str,
    auto_commit: bool = True,
) -> TaskRun:
    """标记任务失败。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.status = "failed"
    run.current_step = current_step
    run.error_message = error_message
    run.finished_at = _utc_now()
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def mark_step_started(
    db: Session,
    *,
    step_id: str,
    celery_task_id: str | None,
    auto_commit: bool = True,
) -> TaskStepRun:
    """标记步骤开始执行。"""
    step = db.query(TaskStepRun).filter(TaskStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"task step not found: {step_id}")
    step.status = "running"
    step.attempt_count += 1
    step.celery_task_id = celery_task_id
    step.error_message = None
    step.started_at = _utc_now()
    step.finished_at = None
    if auto_commit:
        db.commit()
        db.refresh(step)
    else:
        db.flush()
    return step


def mark_step_succeeded(
    db: Session,
    *,
    step_id: str,
    output_payload: dict[str, Any] | None,
    external_ref: dict[str, Any] | None = None,
    auto_commit: bool = True,
) -> TaskStepRun:
    """标记步骤成功并写入结果。"""
    step = db.query(TaskStepRun).filter(TaskStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"task step not found: {step_id}")
    step.status = "succeeded"
    step.output_payload_json = _dump_json(output_payload)
    step.external_ref_json = _dump_json(external_ref)
    step.error_message = None
    step.finished_at = _utc_now()
    if auto_commit:
        db.commit()
        db.refresh(step)
    else:
        db.flush()
    return step


def mark_step_retrying(
    db: Session,
    *,
    step_id: str,
    error_message: str,
    auto_commit: bool = True,
) -> TaskStepRun:
    """标记步骤进入自动重试等待。"""
    step = db.query(TaskStepRun).filter(TaskStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"task step not found: {step_id}")
    step.status = "retrying"
    step.error_message = error_message
    step.finished_at = _utc_now()
    if auto_commit:
        db.commit()
        db.refresh(step)
    else:
        db.flush()
    return step


def mark_step_failed(
    db: Session,
    *,
    step_id: str,
    error_message: str,
    auto_commit: bool = True,
) -> TaskStepRun:
    """标记步骤失败。"""
    step = db.query(TaskStepRun).filter(TaskStepRun.id == step_id).with_for_update().first()
    if step is None:
        raise RuntimeError(f"task step not found: {step_id}")
    step.status = "failed"
    step.error_message = error_message
    step.finished_at = _utc_now()
    if auto_commit:
        db.commit()
        db.refresh(step)
    else:
        db.flush()
    return step


def mark_run_succeeded(
    db: Session,
    *,
    run_id: str,
    output_payload: dict[str, Any] | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    auto_commit: bool = True,
) -> TaskRun:
    """标记任务成功完成。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.status = "succeeded"
    run.error_message = None
    run.current_step = None
    run.finished_at = _utc_now()
    if output_payload is not None:
        run.output_payload_json = _dump_json(output_payload)
    if resource_type is not None:
        run.resource_type = resource_type
    if resource_id is not None:
        run.resource_id = resource_id
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def update_run_resource(
    db: Session,
    *,
    run_id: str,
    resource_type: str | None,
    resource_id: str | None,
    output_payload: dict[str, Any] | None = None,
    auto_commit: bool = True,
) -> TaskRun:
    """更新任务当前资源引用。"""
    run = db.query(TaskRun).filter(TaskRun.id == run_id).with_for_update().first()
    if run is None:
        raise RuntimeError(f"task run not found: {run_id}")
    run.resource_type = resource_type
    run.resource_id = resource_id
    if output_payload is not None:
        run.output_payload_json = _dump_json(output_payload)
    if auto_commit:
        db.commit()
        db.refresh(run)
    else:
        db.flush()
    return run


def retry_run(db: Session, *, user_id: str, run_id: str, strategy: str) -> TaskRun:
    """重置失败任务供重新执行。"""
    run = get_by_id_for_update(db=db, run_id=run_id)
    if run is None or run.user_id != user_id:
        raise RuntimeError(f"task run not found: {run_id}")
    steps = sorted(run.steps, key=lambda item: item.step_order)
    reset_from = 0
    if strategy == "from_failed_step":
        failed_step = next(
            (step for step in steps if step.status in {"failed", "retrying"} or (step.step_name == run.current_step and step.status != "succeeded")),
            None,
        )
        if failed_step is not None:
            reset_from = failed_step.step_order
    for step in steps:
        if step.step_order < reset_from:
            continue
        step.status = "pending"
        step.error_message = None
        step.celery_task_id = None
        step.started_at = None
        step.finished_at = None
        step.external_ref_json = None
        step.output_payload_json = None
        step.attempt_count = 0
    run.status = "queued"
    run.error_message = None
    run.finished_at = None
    run.current_step = steps[reset_from].step_name if steps else None
    run.celery_root_id = None
    db.commit()
    return get_by_id(db=db, user_id=user_id, run_id=run_id)  # type: ignore[return-value]


def load_json(payload_json: str | None) -> dict[str, Any]:
    """向业务层暴露 JSON 解析工具。"""
    return _load_json(payload_json)
