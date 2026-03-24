"""Data access helpers for fragments."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from models import ContentMediaLink, Fragment, FragmentTag
from modules.shared.content.content_html import (
    convert_markdown_to_basic_html,
    extract_plain_text_from_html,
    normalize_body_html,
)

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
        .order_by(Fragment.updated_at.desc())
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
    """查询可参与向量化的碎片。"""
    return (
        db.query(Fragment)
        .filter(Fragment.user_id == user_id)
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
        .filter(
            Fragment.user_id == user_id,
            Fragment.created_at >= start_at,
            Fragment.created_at < end_at,
            func.length(func.trim(Fragment.plain_text_snapshot)) > 0,
        )
        .order_by(Fragment.created_at.asc())
        .all()
    )


def list_created_in_range(
    db: Session,
    user_id: str,
    start_at: datetime,
    end_at: datetime,
) -> list[Fragment]:
    """查询指定时间窗内创建的全部碎片，供内容回退筛选使用。"""
    return (
        db.query(Fragment)
        .filter(
            Fragment.user_id == user_id,
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
    audio_source: Optional[str],
    audio_storage_provider: Optional[str],
    audio_bucket: Optional[str],
    audio_object_key: Optional[str],
    audio_access_level: Optional[str],
    audio_original_filename: Optional[str],
    audio_mime_type: Optional[str],
    audio_file_size: Optional[int],
    audio_checksum: Optional[str],
    body_html: str | None = None,
    plain_text_snapshot: str = "",
    *,
    folder_id: Optional[str] = None,
    tags_json: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Fragment:
    """创建碎片主记录并同步归一化标签。"""
    normalized_body_html = normalize_body_html(body_html)
    normalized_plain_text = plain_text_snapshot or extract_plain_text_from_html(normalized_body_html)
    fragment = Fragment(
        user_id=user_id,
        folder_id=folder_id,
        transcript=transcript,
        audio_storage_provider=audio_storage_provider,
        audio_bucket=audio_bucket,
        audio_object_key=audio_object_key,
        audio_access_level=audio_access_level,
        audio_original_filename=audio_original_filename,
        audio_mime_type=audio_mime_type,
        audio_file_size=audio_file_size,
        audio_checksum=audio_checksum,
        body_html=normalized_body_html,
        plain_text_snapshot=normalized_plain_text,
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
    """删除指定碎片，同时清理关联的 content_media_links 记录，避免孤儿关联积累。"""
    db.query(ContentMediaLink).filter(
        ContentMediaLink.content_type == "fragment",
        ContentMediaLink.content_id == fragment.id,
    ).delete()
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
    """落库转写、摘要、标签和说话人分段结果，并同步到正文编辑区。"""
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False

    fragment.transcript = transcript
    fragment.speaker_segments = speaker_segments_json
    fragment.summary = summary
    fragment.tags = tags_json
    # 如果 body_html 为空，将 transcript 同步到正文编辑区
    if not fragment.body_html or not fragment.body_html.strip():
        fragment.body_html = convert_markdown_to_basic_html(transcript)
        fragment.plain_text_snapshot = transcript
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


def update_content(
    db: Session,
    *,
    fragment: Fragment,
    body_html: str,
    plain_text_snapshot: str,
) -> Fragment:
    """更新碎片正文真值及派生纯文本快照。"""
    fragment.body_html = normalize_body_html(body_html)
    fragment.plain_text_snapshot = plain_text_snapshot
    db.commit()
    db.refresh(fragment)
    return fragment


def update_audio_file(
    db: Session,
    *,
    fragment_id: str,
    user_id: str,
    audio_storage_provider: str,
    audio_bucket: str,
    audio_object_key: str,
    audio_access_level: str,
    audio_original_filename: str,
    audio_mime_type: str,
    audio_file_size: int,
    audio_checksum: str | None,
) -> bool:
    """更新碎片音频对象存储元数据。"""
    fragment = get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        return False
    fragment.audio_storage_provider = audio_storage_provider
    fragment.audio_bucket = audio_bucket
    fragment.audio_object_key = audio_object_key
    fragment.audio_access_level = audio_access_level
    fragment.audio_original_filename = audio_original_filename
    fragment.audio_mime_type = audio_mime_type
    fragment.audio_file_size = audio_file_size
    fragment.audio_checksum = audio_checksum
    db.commit()
    return True


def move_by_ids(db: Session, *, fragments: list[Fragment], folder_id: Optional[str]) -> list[Fragment]:
    for fragment in fragments:
        fragment.folder_id = folder_id
    db.commit()
    for fragment in fragments:
        db.refresh(fragment)
    return fragments
