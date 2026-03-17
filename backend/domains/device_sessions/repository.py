from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from models import DeviceSession


def list_active_by_user(db: Session, *, user_id: str) -> list[DeviceSession]:
    """读取当前用户的所有活跃设备会话。"""
    return (
        db.query(DeviceSession)
        .filter(DeviceSession.user_id == user_id, DeviceSession.status == "active")
        .all()
    )


def get_by_user_and_device(db: Session, *, user_id: str, device_id: str) -> DeviceSession | None:
    """按用户和设备读取当前会话。"""
    return (
        db.query(DeviceSession)
        .filter(DeviceSession.user_id == user_id, DeviceSession.device_id == device_id)
        .first()
    )


def revoke_active_for_user(
    db: Session,
    *,
    user_id: str,
    revoked_at: datetime,
    keep_device_id: str | None = None,
) -> None:
    """撤销同一用户下除指定设备外的活跃会话。"""
    query = db.query(DeviceSession).filter(
        DeviceSession.user_id == user_id,
        DeviceSession.status == "active",
    )
    if keep_device_id is not None:
        query = query.filter(DeviceSession.device_id != keep_device_id)
    for session in query.all():
        session.status = "revoked"
        session.revoked_at = revoked_at
        session.updated_at = revoked_at
    db.flush()


def create_or_replace_active_session(
    db: Session,
    *,
    user_id: str,
    device_id: str,
    session_version: int,
    created_at: datetime,
) -> DeviceSession:
    """为当前设备创建或覆盖活跃会话。"""
    session = get_by_user_and_device(db=db, user_id=user_id, device_id=device_id)
    if session is None:
        session = DeviceSession(
            user_id=user_id,
            device_id=device_id,
            session_version=session_version,
            status="active",
            created_at=created_at,
            updated_at=created_at,
            last_seen_at=created_at,
            revoked_at=None,
        )
        db.add(session)
    else:
        session.session_version = session_version
        session.status = "active"
        session.updated_at = created_at
        session.last_seen_at = created_at
        session.revoked_at = None
    db.flush()
    db.refresh(session)
    return session


def touch_session(db: Session, *, session: DeviceSession, seen_at: datetime) -> DeviceSession:
    """更新设备会话最近活跃时间。"""
    session.last_seen_at = seen_at
    session.updated_at = seen_at
    db.flush()
    db.refresh(session)
    return session
