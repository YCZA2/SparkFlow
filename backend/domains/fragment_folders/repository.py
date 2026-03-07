"""Data access helpers for fragment folders."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Fragment, FragmentFolder


def list_by_user_with_counts(db: Session, user_id: str) -> list[tuple[FragmentFolder, int]]:
    rows = (
        db.query(FragmentFolder, func.count(Fragment.id))
        .outerjoin(Fragment, Fragment.folder_id == FragmentFolder.id)
        .filter(FragmentFolder.user_id == user_id)
        .group_by(FragmentFolder.id)
        .order_by(FragmentFolder.created_at.asc())
        .all()
    )
    return [(folder, count or 0) for folder, count in rows]


def get_by_id(db: Session, user_id: str, folder_id: str) -> Optional[FragmentFolder]:
    return (
        db.query(FragmentFolder)
        .filter(FragmentFolder.id == folder_id, FragmentFolder.user_id == user_id)
        .first()
    )


def get_by_name(db: Session, user_id: str, name: str) -> Optional[FragmentFolder]:
    return (
        db.query(FragmentFolder)
        .filter(FragmentFolder.user_id == user_id, FragmentFolder.name == name)
        .first()
    )


def create(db: Session, *, user_id: str, name: str) -> FragmentFolder:
    folder = FragmentFolder(user_id=user_id, name=name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def update_name(db: Session, *, folder: FragmentFolder, name: str) -> FragmentFolder:
    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder


def count_fragments(db: Session, *, user_id: str, folder_id: str) -> int:
    return (
        db.query(func.count(Fragment.id))
        .filter(Fragment.user_id == user_id, Fragment.folder_id == folder_id)
        .scalar()
        or 0
    )


def delete(db: Session, *, folder: FragmentFolder) -> None:
    db.delete(folder)
    db.commit()
