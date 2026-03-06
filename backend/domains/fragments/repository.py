"""Data access helpers for fragments."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Fragment


def list_by_user(db: Session, user_id: str, limit: int, offset: int) -> list[Fragment]:
    return (
        db.query(Fragment)
        .filter(Fragment.user_id == user_id)
        .order_by(Fragment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_by_user(db: Session, user_id: str) -> int:
    return db.query(func.count(Fragment.id)).filter(Fragment.user_id == user_id).scalar() or 0


def get_by_id(db: Session, user_id: str, fragment_id: str) -> Optional[Fragment]:
    return (
        db.query(Fragment)
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )


def create(
    db: Session,
    user_id: str,
    transcript: Optional[str],
    source: str,
    audio_path: Optional[str],
    sync_status: str,
) -> Fragment:
    fragment = Fragment(
        user_id=user_id,
        transcript=transcript,
        audio_path=audio_path,
        source=source,
        sync_status=sync_status,
    )
    db.add(fragment)
    db.commit()
    db.refresh(fragment)
    return fragment


def delete(db: Session, fragment: Fragment) -> None:
    db.delete(fragment)
    db.commit()


def mark_failed(db: Session, fragment_id: str, user_id: str) -> None:
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if fragment:
        fragment.sync_status = "failed"
        db.commit()


def mark_synced(
    db: Session,
    fragment_id: str,
    user_id: str,
    transcript: str,
    summary: Optional[str],
    tags_json: Optional[str],
) -> bool:
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False

    fragment.transcript = transcript
    fragment.summary = summary
    fragment.tags = tags_json
    fragment.sync_status = "synced"
    db.commit()
    return True
