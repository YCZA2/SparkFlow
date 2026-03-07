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
    query = db.query(Fragment).options(joinedload(Fragment.folder))
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
        .options(joinedload(Fragment.folder))
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )


def get_by_ids(db: Session, user_id: str, fragment_ids: list[str]) -> list[Fragment]:
    if not fragment_ids:
        return []

    return (
        db.query(Fragment)
        .options(joinedload(Fragment.folder))
        .filter(Fragment.id.in_(fragment_ids), Fragment.user_id == user_id)
        .all()
    )


def list_vectorizable_by_user(db: Session, user_id: str) -> list[Fragment]:
    return (
        db.query(Fragment)
        .filter(
            Fragment.user_id == user_id,
            Fragment.sync_status == "synced",
            Fragment.transcript.isnot(None),
        )
        .order_by(Fragment.created_at.asc())
        .all()
    )


def list_synced_in_range(
    db: Session,
    user_id: str,
    start_at: datetime,
    end_at: datetime,
) -> list[Fragment]:
    return (
        db.query(Fragment)
        .filter(
            Fragment.user_id == user_id,
            Fragment.sync_status == "synced",
            Fragment.transcript.isnot(None),
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
    source: str,
    audio_path: Optional[str],
    sync_status: str,
    *,
    folder_id: Optional[str] = None,
    tags_json: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Fragment:
    fragment = Fragment(
        user_id=user_id,
        folder_id=folder_id,
        transcript=transcript,
        audio_path=audio_path,
        tags=tags_json,
        source=source,
        sync_status=sync_status,
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
    speaker_segments_json: Optional[str],
) -> bool:
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False

    fragment.transcript = transcript
    fragment.speaker_segments = speaker_segments_json
    fragment.summary = summary
    fragment.tags = tags_json
    fragment.sync_status = "synced"
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


def move_by_ids(db: Session, *, fragments: list[Fragment], folder_id: Optional[str]) -> list[Fragment]:
    for fragment in fragments:
        fragment.folder_id = folder_id
    db.commit()
    for fragment in fragments:
        db.refresh(fragment)
    return fragments
