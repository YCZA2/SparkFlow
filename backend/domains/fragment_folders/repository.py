"""Data access helpers for fragment folders."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models import FragmentFolder


def list_by_user(db: Session, user_id: str) -> list[FragmentFolder]:
    """读取当前用户全部文件夹，计数由 snapshot 层补齐。"""
    return (
        db.query(FragmentFolder)
        .filter(FragmentFolder.user_id == user_id)
        .order_by(FragmentFolder.created_at.asc())
        .all()
    )


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
def delete(db: Session, *, folder: FragmentFolder) -> None:
    db.delete(folder)
    db.commit()
