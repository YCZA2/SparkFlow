"""每日推盘快照读取测试。"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from domains.backups import repository as backup_repository
from models import User
from modules.auth.application import TEST_USER_ID
from modules.scripts.daily_push_snapshots import DailyPushSnapshotReader


def _insert_fragment_backup(
    db,
    *,
    entity_id: str,
    created_at: datetime,
    plain_text_snapshot: str,
    operation: str = "upsert",
    deleted_at: str | None = None,
) -> None:
    """写入一条 fragment 备份记录，供快照读取测试复用。"""
    updated_at = created_at + timedelta(minutes=5)
    payload = None
    if operation == "upsert":
        payload = json.dumps(
            {
                "id": entity_id,
                "source": "manual",
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
                "summary": None,
                "tags": [],
                "body_html": f"<p>{plain_text_snapshot}</p>" if plain_text_snapshot else "",
                "plain_text_snapshot": plain_text_snapshot,
                "transcript": None,
                "deleted_at": deleted_at,
            },
            ensure_ascii=False,
        )
    backup_repository.upsert_record(
        db=db,
        user_id=TEST_USER_ID,
        entity_type="fragment",
        entity_id=entity_id,
        entity_version=1,
        operation=operation,
        payload_json=payload,
        modified_at=updated_at,
        last_modified_device_id="device-1",
        now=updated_at,
    )


def test_snapshot_reader_filters_deleted_empty_and_cross_day_records(db_session_factory) -> None:
    """快照读取应只返回目标日内、未删除且正文非空的 fragment。"""
    reader = DailyPushSnapshotReader()
    reference = datetime(2026, 3, 25, 3, 0, tzinfo=timezone.utc)
    with db_session_factory() as db:
        _insert_fragment_backup(
            db,
            entity_id="keep-me",
            created_at=reference,
            plain_text_snapshot="这是有效快照",
        )
        _insert_fragment_backup(
            db,
            entity_id="empty-text",
            created_at=reference,
            plain_text_snapshot="",
        )
        _insert_fragment_backup(
            db,
            entity_id="deleted",
            created_at=reference,
            plain_text_snapshot="已删除",
            deleted_at=reference.isoformat(),
        )
        _insert_fragment_backup(
            db,
            entity_id="yesterday",
            created_at=reference - timedelta(days=1),
            plain_text_snapshot="跨天快照",
        )
        db.commit()

        snapshots = reader.list_fragment_snapshots(
            db=db,
            user_id=TEST_USER_ID,
            start_at=reference.replace(hour=0, minute=0, second=0, microsecond=0),
            end_at=reference.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1),
        )

    assert [item.id for item in snapshots] == ["keep-me"]


def test_snapshot_reader_lists_only_users_with_fragment_upserts(db_session_factory) -> None:
    """用户枚举应忽略只有删除 tombstone 的 fragment 备份。"""
    with db_session_factory() as db:
        now = datetime.now(timezone.utc)
        _insert_fragment_backup(db, entity_id="keep-user", created_at=now, plain_text_snapshot="正文")
        db.add(
            User(
                id="user-delete-only",
                role="user",
                nickname="删除用户",
                email="delete-only@sparkflow.dev",
                password_hash="test-password-hash",
            )
        )
        db.flush()
        backup_repository.upsert_record(
            db=db,
            user_id="user-delete-only",
            entity_type="fragment",
            entity_id="deleted-only",
            entity_version=1,
            operation="delete",
            payload_json=None,
            modified_at=now,
            last_modified_device_id="device-2",
            now=now,
        )
        db.commit()
        user_ids = DailyPushSnapshotReader().list_user_ids(db=db)

    assert user_ids == [TEST_USER_ID]
