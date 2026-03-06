"""Data access helpers for scripts."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Fragment, Script


def list_by_user(db: Session, user_id: str, limit: int, offset: int) -> list[Script]:
    return (
        db.query(Script)
        .filter(Script.user_id == user_id)
        .order_by(Script.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_by_user(db: Session, user_id: str) -> int:
    return db.query(func.count(Script.id)).filter(Script.user_id == user_id).scalar() or 0


def get_by_id(db: Session, user_id: str, script_id: str) -> Optional[Script]:
    return (
        db.query(Script)
        .filter(Script.id == script_id, Script.user_id == user_id)
        .first()
    )


def create(
    db: Session,
    user_id: str,
    content: str,
    mode: str,
    source_fragment_ids: str,
) -> Script:
    script = Script(
        user_id=user_id,
        title=None,
        content=content,
        mode=mode,
        source_fragment_ids=source_fragment_ids,
        status="draft",
        is_daily_push=False,
    )
    db.add(script)
    db.commit()
    db.refresh(script)
    return script


def delete(db: Session, script: Script) -> None:
    db.delete(script)
    db.commit()


def update(db: Session, script: Script, *, status_value: Optional[str], title: Optional[str]) -> Script:
    if status_value is not None:
        script.status = status_value
    if title is not None:
        script.title = title
    db.commit()
    db.refresh(script)
    return script


def get_fragments_for_user(db: Session, user_id: str, fragment_ids: list[str]) -> list[Fragment]:
    return (
        db.query(Fragment)
        .filter(Fragment.id.in_(fragment_ids), Fragment.user_id == user_id)
        .all()
    )
