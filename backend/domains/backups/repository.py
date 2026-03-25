from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from models import BackupRecord, BackupRestoreSession


def get_record(
    db: Session,
    *,
    user_id: str,
    entity_type: str,
    entity_id: str,
) -> BackupRecord | None:
    """按用户与实体键读取当前备份快照。"""
    return (
        db.query(BackupRecord)
        .filter(
            BackupRecord.user_id == user_id,
            BackupRecord.entity_type == entity_type,
            BackupRecord.entity_id == entity_id,
        )
        .first()
    )


def list_records(
    db: Session,
    *,
    user_id: str,
    since_updated_at: datetime | None = None,
) -> list[BackupRecord]:
    """读取用户备份快照，支持按更新时间增量查询。"""
    query = db.query(BackupRecord).filter(BackupRecord.user_id == user_id)
    if since_updated_at is not None:
        query = query.filter(BackupRecord.updated_at >= since_updated_at)
    return query.order_by(BackupRecord.updated_at.asc(), BackupRecord.entity_type.asc()).all()


def list_records_by_entity_type(
    db: Session,
    *,
    user_id: str,
    entity_type: str,
) -> list[BackupRecord]:
    """按实体类型读取用户备份快照，供内部聚合逻辑复用。"""
    return (
        db.query(BackupRecord)
        .filter(
            BackupRecord.user_id == user_id,
            BackupRecord.entity_type == entity_type,
        )
        .order_by(BackupRecord.updated_at.asc(), BackupRecord.entity_id.asc())
        .all()
    )


def list_user_ids_by_entity_type(
    db: Session,
    *,
    entity_type: str,
    operation: str | None = None,
) -> list[str]:
    """按实体类型枚举出现过备份记录的用户，用于定时任务扫描。"""
    query = db.query(BackupRecord.user_id).filter(BackupRecord.entity_type == entity_type)
    if operation is not None:
        query = query.filter(BackupRecord.operation == operation)
    rows = query.distinct().all()
    return [row[0] for row in rows if row and row[0]]


def upsert_record(
    db: Session,
    *,
    user_id: str,
    entity_type: str,
    entity_id: str,
    entity_version: int,
    operation: str,
    payload_json: str | None,
    modified_at: datetime | None,
    last_modified_device_id: str | None,
    now: datetime,
) -> BackupRecord:
    """按最后写入赢策略写入或覆盖单条备份快照。"""
    record = get_record(db=db, user_id=user_id, entity_type=entity_type, entity_id=entity_id)
    if record is None:
        record = BackupRecord(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_version=entity_version,
            operation=operation,
            payload_json=payload_json,
            modified_at=modified_at,
            last_modified_device_id=last_modified_device_id,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.flush()
        db.refresh(record)
        return record

    record.entity_version = entity_version
    record.operation = operation
    record.payload_json = payload_json
    record.modified_at = modified_at
    record.last_modified_device_id = last_modified_device_id
    record.updated_at = now
    db.flush()
    db.refresh(record)
    return record


def create_restore_session(
    db: Session,
    *,
    user_id: str,
    device_id: str | None,
    reason: str | None,
    snapshot_generated_at: datetime,
) -> BackupRestoreSession:
    """记录一次恢复操作，便于后续审计与诊断。"""
    session = BackupRestoreSession(
        user_id=user_id,
        device_id=device_id,
        reason=reason,
        snapshot_generated_at=snapshot_generated_at,
        created_at=snapshot_generated_at,
    )
    db.add(session)
    db.flush()
    db.refresh(session)
    return session
