"""Data access helpers for fragments."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from models import Fragment, FragmentTag

from domains.fragment_tags import repository as fragment_tag_repository


def _apply_fragment_filters(query, *, user_id: str, folder_id: Optional[str] = None, tag: Optional[str] = None):
    query = query.filter(Fragment.user_id == user_id)

    if folder_id is not None:
        query = query.filter(Fragment.folder_id == folder_id)

    if tag:
        query = query.join(FragmentTag, FragmentTag.fragment_id == Fragment.id).filter(
            FragmentTag.user_id == user_id,
            FragmentTag.tag == tag,
        )

    return query


def list_by_user(
    db: Session,
    user_id: str,
    limit: int,
    offset: int,
    *,
    folder_id: Optional[str] = None,
    tag: Optional[str] = None,
) -> list[Fragment]:
    query = db.query(Fragment).options(joinedload(Fragment.folder), joinedload(Fragment.blocks))
    query = _apply_fragment_filters(query, user_id=user_id, folder_id=folder_id, tag=tag)
    return (
        query
        .order_by(Fragment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_by_user(db: Session, user_id: str, *, folder_id: Optional[str] = None, tag: Optional[str] = None) -> int:
    query = db.query(func.count(func.distinct(Fragment.id)))
    query = _apply_fragment_filters(query, user_id=user_id, folder_id=folder_id, tag=tag)
    return query.scalar() or 0


def get_by_id(db: Session, user_id: str, fragment_id: str) -> Optional[Fragment]:
    return (
        db.query(Fragment)
        .options(joinedload(Fragment.folder), joinedload(Fragment.blocks))
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )


def get_by_ids(db: Session, user_id: str, fragment_ids: list[str]) -> list[Fragment]:
    if not fragment_ids:
        return []

    return (
        db.query(Fragment)
        .options(joinedload(Fragment.folder), joinedload(Fragment.blocks))
        .filter(Fragment.id.in_(fragment_ids), Fragment.user_id == user_id)
        .all()
    )


def list_vectorizable_by_user(db: Session, user_id: str) -> list[Fragment]:
    return (
        db.query(Fragment)
        .options(joinedload(Fragment.blocks))
        .filter(
            Fragment.user_id == user_id,
            Fragment.transcript.isnot(None),
        )
        .order_by(Fragment.created_at.asc())
        .all()
    )


def list_content_ready_in_range(
    db: Session,
    user_id: str,
    start_at: datetime,
    end_at: datetime,
) -> list[Fragment]:
    """查询指定时间窗内已有可用文本内容的碎片。"""
    return (
        db.query(Fragment)
        .options(joinedload(Fragment.blocks))
        .filter(
            Fragment.user_id == user_id,
            func.coalesce(Fragment.capture_text, Fragment.transcript).isnot(None),
            Fragment.created_at >= start_at,
            Fragment.created_at < end_at,
        )
        .order_by(Fragment.created_at.asc())
        .all()
    )


def create(
    db: Session,
    user_id: str,
    transcript: Optional[str],
    capture_text: Optional[str],
    source: str,
    audio_source: Optional[str],
    audio_path: Optional[str],
    *,
    folder_id: Optional[str] = None,
    tags_json: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Fragment:
    fragment = Fragment(
        user_id=user_id,
        folder_id=folder_id,
        capture_text=capture_text,
        transcript=transcript,
        audio_path=audio_path,
        tags=tags_json,
        source=source,
        audio_source=audio_source,
    )
    db.add(fragment)
    db.flush()
    fragment_tag_repository.replace_for_fragment(
        db=db,
        user_id=user_id,
        fragment_id=fragment.id,
        tags=tags or [],
    )
    db.commit()
    db.refresh(fragment)
    return fragment


def delete(db: Session, fragment: Fragment) -> None:
    db.delete(fragment)
    db.commit()


def save_transcription_result(
    db: Session,
    fragment_id: str,
    user_id: str,
    transcript: str,
    summary: Optional[str],
    tags_json: Optional[str],
    speaker_segments_json: Optional[str],
) -> bool:
    """落库转写、摘要、标签和说话人分段结果。"""
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False

    fragment.transcript = transcript
    fragment.capture_text = transcript
    fragment.speaker_segments = speaker_segments_json
    fragment.summary = summary
    fragment.tags = tags_json
    fragment_tag_repository.replace_for_fragment(
        db=db,
        user_id=user_id,
        fragment_id=fragment.id,
        tags=fragment_tag_repository.parse_tags_json(tags_json),
    )
    db.commit()
    return True


def update_folder(db: Session, fragment: Fragment, *, folder_id: Optional[str]) -> Fragment:
    fragment.folder_id = folder_id
    db.commit()
    db.refresh(fragment)
    return fragment


def update_audio_path(db: Session, *, fragment_id: str, user_id: str, audio_path: str) -> bool:
    """更新碎片音频路径，供异步导入链路补写产物地址。"""
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False
    fragment.audio_path = audio_path
    db.commit()
    return True


def update_capture_text(db: Session, *, fragment_id: str, user_id: str, capture_text: str | None) -> bool:
    """更新碎片原始采集文本。"""
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False
    fragment.capture_text = capture_text
    db.commit()
    return True


def move_by_ids(db: Session, *, fragments: list[Fragment], folder_id: Optional[str]) -> list[Fragment]:
    for fragment in fragments:
        fragment.folder_id = folder_id
    db.commit()
    for fragment in fragments:
        db.refresh(fragment)
    return fragments
