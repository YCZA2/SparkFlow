"""Fragment domain service.

封装碎片笔记相关业务逻辑：
- 查询与序列化
- 创建与删除
- 权限校验
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment

VALID_FRAGMENT_SOURCES = {"voice", "manual", "video_parse"}


def serialize_fragment(fragment: Fragment, include_audio_path: bool = False) -> dict[str, Any]:
    """Convert Fragment ORM object to API-safe dict."""
    data = {
        "id": fragment.id,
        "transcript": fragment.transcript,
        "summary": fragment.summary,
        "tags": fragment.tags,
        "source": fragment.source,
        "sync_status": fragment.sync_status,
        "created_at": fragment.created_at.isoformat() if fragment.created_at else None,
    }
    if include_audio_path:
        data["audio_path"] = fragment.audio_path
    return data


def serialize_transcribe_status(fragment: Fragment) -> dict[str, Any]:
    """Serialize fragment for transcribe status endpoint payload."""
    data = serialize_fragment(fragment, include_audio_path=True)
    data["fragment_id"] = data.pop("id")
    return data


def list_fragments(db: Session, user_id: str, limit: int, offset: int) -> list[Fragment]:
    """List fragments ordered by creation time desc."""
    return (
        db.query(Fragment)
        .filter(Fragment.user_id == user_id)
        .order_by(Fragment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_fragments(db: Session, user_id: str) -> int:
    """Count all fragments for a user."""
    return (
        db.query(func.count(Fragment.id))
        .filter(Fragment.user_id == user_id)
        .scalar()
        or 0
    )


def get_fragment_or_raise(db: Session, user_id: str, fragment_id: str) -> Fragment:
    """Load one fragment or raise not found."""
    fragment = (
        db.query(Fragment)
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )
    if not fragment:
        raise NotFoundError(
            message="碎片笔记不存在或无权访问",
            resource_type="fragment",
            resource_id=fragment_id,
        )
    return fragment


def create_fragment(
    db: Session,
    user_id: str,
    transcript: Optional[str],
    source: str,
    audio_path: Optional[str],
) -> Fragment:
    """Create and persist one fragment for a user."""
    if source not in VALID_FRAGMENT_SOURCES:
        sources_display = ", ".join(sorted(VALID_FRAGMENT_SOURCES))
        raise ValidationError(
            message=f"无效的 source 值，必须是以下之一: {sources_display}",
            field_errors={"source": f"必须是以下之一: {sources_display}"},
        )

    fragment = Fragment(
        user_id=user_id,
        transcript=transcript,
        audio_path=audio_path,
        source=source,
        sync_status="synced" if transcript else "pending",
    )
    db.add(fragment)
    db.commit()
    db.refresh(fragment)
    return fragment


def delete_fragment(db: Session, user_id: str, fragment_id: str) -> None:
    """Delete one fragment."""
    fragment = get_fragment_or_raise(db, user_id, fragment_id)
    db.delete(fragment)
    db.commit()
