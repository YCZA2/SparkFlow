"""Data access helpers for scripts."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ContentMediaLink, Fragment, Script


def list_by_user(db: Session, user_id: str, limit: int, offset: int) -> list[Script]:
    return (
        db.query(Script)
        .filter(Script.user_id == user_id)
        .order_by(Script.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def list_recent_by_user(
    db: Session,
    *,
    user_id: str,
    limit: int = 50,
) -> list[Script]:
    """读取用户最近生成的稿件，供相关素材召回。"""
    return (
        db.query(Script)
        .filter(Script.user_id == user_id)
        .order_by(Script.created_at.desc())
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
    body_html: str,
    mode: str,
    source_fragment_ids: str,
    *,
    title: Optional[str] = None,
    status: str = "draft",
    is_daily_push: bool = False,
) -> Script:
    script = Script(
        user_id=user_id,
        title=title,
        body_html=body_html,
        mode=mode,
        source_fragment_ids=source_fragment_ids,
        status=status,
        is_daily_push=is_daily_push,
    )
    db.add(script)
    db.commit()
    db.refresh(script)
    return script


def delete(db: Session, script: Script) -> None:
    """删除指定稿件，同时清理关联的 content_media_links 记录，避免孤儿关联积累。"""
    db.query(ContentMediaLink).filter(
        ContentMediaLink.content_type == "script",
        ContentMediaLink.content_id == script.id,
    ).delete()
    db.delete(script)
    db.commit()


def update(
    db: Session,
    script: Script,
    *,
    status_value: Optional[str],
    title: Optional[str],
    body_html: Optional[str] = None,
    source_fragment_ids: Optional[str] = None,
) -> Script:
    if status_value is not None:
        script.status = status_value
    if title is not None:
        script.title = title
    if body_html is not None:
        script.body_html = body_html
    if source_fragment_ids is not None:
        script.source_fragment_ids = source_fragment_ids
    db.commit()
    db.refresh(script)
    return script


def get_fragments_for_user(db: Session, user_id: str, fragment_ids: list[str]) -> list[Fragment]:
    return (
        db.query(Fragment)
        .filter(Fragment.id.in_(fragment_ids), Fragment.user_id == user_id)
        .all()
    )


def get_latest_daily_push_for_window(
    db: Session,
    user_id: str,
    start_at: datetime,
    end_at: datetime,
) -> Optional[Script]:
    return (
        db.query(Script)
        .filter(
            Script.user_id == user_id,
            Script.is_daily_push.is_(True),
            Script.created_at >= start_at,
            Script.created_at < end_at,
        )
        .order_by(Script.created_at.desc())
        .first()
    )
