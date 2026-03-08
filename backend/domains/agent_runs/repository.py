"""Data access helpers for agent workflow runs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models import AgentRun


def create(
    db: Session,
    *,
    user_id: str,
    workflow_type: str,
    mode: str,
    source_fragment_ids: str,
    query_hint: Optional[str],
    include_web_search: bool,
    request_payload_json: Optional[str],
    dify_workflow_id: Optional[str],
) -> AgentRun:
    run = AgentRun(
        user_id=user_id,
        workflow_type=workflow_type,
        mode=mode,
        source_fragment_ids=source_fragment_ids,
        query_hint=query_hint,
        include_web_search=include_web_search,
        request_payload_json=request_payload_json,
        dify_workflow_id=dify_workflow_id,
        status="queued",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_by_id(db: Session, *, user_id: str, run_id: str) -> Optional[AgentRun]:
    return db.query(AgentRun).filter(AgentRun.id == run_id, AgentRun.user_id == user_id).first()


def mark_submitted(db: Session, *, run: AgentRun, dify_run_id: str) -> AgentRun:
    run.dify_run_id = dify_run_id
    run.status = "running"
    run.error_message = None
    db.commit()
    db.refresh(run)
    return run


def mark_running(db: Session, *, run: AgentRun, result_payload_json: Optional[str] = None) -> AgentRun:
    run.status = "running"
    if result_payload_json is not None:
        run.result_payload_json = result_payload_json
    run.error_message = None
    db.commit()
    db.refresh(run)
    return run


def mark_failed(db: Session, *, run: AgentRun, error_message: str, result_payload_json: Optional[str] = None) -> AgentRun:
    run.status = "failed"
    run.error_message = error_message
    run.finished_at = datetime.now(timezone.utc)
    if result_payload_json is not None:
        run.result_payload_json = result_payload_json
    db.commit()
    db.refresh(run)
    return run


def mark_succeeded(
    db: Session,
    *,
    run: AgentRun,
    script_id: str,
    result_payload_json: str,
    dify_workflow_id: Optional[str] = None,
) -> AgentRun:
    run.status = "succeeded"
    run.script_id = script_id
    run.result_payload_json = result_payload_json
    run.error_message = None
    run.finished_at = datetime.now(timezone.utc)
    if dify_workflow_id:
        run.dify_workflow_id = dify_workflow_id
    db.commit()
    db.refresh(run)
    return run


def update_result_payload(
    db: Session,
    *,
    run: AgentRun,
    result_payload_json: str,
    dify_workflow_id: Optional[str] = None,
) -> AgentRun:
    run.result_payload_json = result_payload_json
    if dify_workflow_id:
        run.dify_workflow_id = dify_workflow_id
    db.commit()
    db.refresh(run)
    return run
