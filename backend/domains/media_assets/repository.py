"""Data access helpers for media assets."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models import ContentMediaLink, MediaAsset


def create(
    db: Session,
    *,
    asset_id: str | None = None,
    user_id: str,
    media_kind: str,
    original_filename: str,
    mime_type: str,
    storage_provider: str,
    bucket: str,
    object_key: str,
    access_level: str,
    file_size: int,
    checksum: str | None,
    width: int | None = None,
    height: int | None = None,
    duration_ms: int | None = None,
    status: str = "ready",
) -> MediaAsset:
    """创建一条媒体资源记录。"""
    asset = MediaAsset(
        id=asset_id,
        user_id=user_id,
        media_kind=media_kind,
        original_filename=original_filename,
        mime_type=mime_type,
        storage_provider=storage_provider,
        bucket=bucket,
        object_key=object_key,
        access_level=access_level,
        file_size=file_size,
        checksum=checksum,
        width=width,
        height=height,
        duration_ms=duration_ms,
        status=status,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def get_by_id(db: Session, *, user_id: str, asset_id: str) -> Optional[MediaAsset]:
    """按用户读取单条媒体资源。"""
    return (
        db.query(MediaAsset)
        .filter(MediaAsset.id == asset_id, MediaAsset.user_id == user_id)
        .first()
    )


def list_by_user(db: Session, *, user_id: str, media_kind: str | None = None, limit: int = 50, offset: int = 0) -> list[MediaAsset]:
    """分页返回当前用户的媒体资源。"""
    query = db.query(MediaAsset).filter(MediaAsset.user_id == user_id)
    if media_kind:
        query = query.filter(MediaAsset.media_kind == media_kind)
    return query.order_by(MediaAsset.created_at.desc()).offset(offset).limit(limit).all()


def delete(db: Session, *, asset: MediaAsset) -> None:
    """删除媒体资源记录。"""
    db.query(ContentMediaLink).filter(ContentMediaLink.media_asset_id == asset.id).delete()
    db.delete(asset)
    db.commit()


def attach_to_content(
    db: Session,
    *,
    user_id: str,
    media_asset_id: str,
    content_type: str,
    content_id: str,
    role: str = "attachment",
) -> ContentMediaLink:
    """将媒体资源挂到指定内容对象上。"""
    link = (
        db.query(ContentMediaLink)
        .filter(
            ContentMediaLink.user_id == user_id,
            ContentMediaLink.media_asset_id == media_asset_id,
            ContentMediaLink.content_type == content_type,
            ContentMediaLink.content_id == content_id,
            ContentMediaLink.role == role,
        )
        .first()
    )
    if link:
        return link
    link = ContentMediaLink(
        user_id=user_id,
        media_asset_id=media_asset_id,
        content_type=content_type,
        content_id=content_id,
        role=role,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def list_content_assets(db: Session, *, user_id: str, content_type: str, content_id: str) -> list[MediaAsset]:
    """读取某条内容绑定的全部媒体资源。"""
    return (
        db.query(MediaAsset)
        .join(ContentMediaLink, ContentMediaLink.media_asset_id == MediaAsset.id)
        .filter(
            ContentMediaLink.user_id == user_id,
            ContentMediaLink.content_type == content_type,
            ContentMediaLink.content_id == content_id,
        )
        .order_by(ContentMediaLink.created_at.asc())
        .all()
    )


def detach_from_content(db: Session, *, user_id: str, content_type: str, content_id: str, media_asset_id: str) -> None:
    """移除内容对象上的媒体资源关联。"""
    (
        db.query(ContentMediaLink)
        .filter(
            ContentMediaLink.user_id == user_id,
            ContentMediaLink.content_type == content_type,
            ContentMediaLink.content_id == content_id,
            ContentMediaLink.media_asset_id == media_asset_id,
        )
        .delete()
    )
    db.commit()
