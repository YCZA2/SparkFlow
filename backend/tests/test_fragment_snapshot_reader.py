"""共享 fragment snapshot reader 测试。"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from domains.backups import repository as backup_repository
from modules.auth.application import TEST_USER_ID
from modules.shared.fragment_snapshots import FragmentSnapshotReader


def _upsert_fragment_record(
    db,
    *,
    entity_id: str,
    body_html: str = "",
    plain_text_snapshot: str = "",
    transcript: str | None = None,
    operation: str = "upsert",
    deleted_at: str | None = None,
) -> None:
    """写入一条 fragment backup record，供 reader 测试复用。"""
    now = datetime(2026, 3, 25, 9, 0, tzinfo=timezone.utc)
    payload = None
    if operation == "upsert":
        payload = json.dumps(
            {
                "id": entity_id,
                "source": "manual",
                "created_at": now.isoformat(),
                "updated_at": (now + timedelta(minutes=5)).isoformat(),
                "body_html": body_html,
                "plain_text_snapshot": plain_text_snapshot,
                "transcript": transcript,
                "summary": None,
                "tags": ["测试"],
                "folder_id": "folder-1",
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
        modified_at=now,
        last_modified_device_id="device-test",
        now=now,
    )


def test_fragment_snapshot_reader_get_by_ids_preserves_order_and_filters_invalid_records(db_session_factory) -> None:
    """批量读取应按输入顺序返回，并过滤空正文与删除记录。"""
    reader = FragmentSnapshotReader()
    with db_session_factory() as db:
        _upsert_fragment_record(db, entity_id="valid-1", body_html="<p>第一条</p>")
        _upsert_fragment_record(db, entity_id="empty", body_html="", plain_text_snapshot="", transcript=None)
        _upsert_fragment_record(db, entity_id="deleted", body_html="<p>已删</p>", deleted_at="2026-03-25T09:00:00+00:00")
        _upsert_fragment_record(db, entity_id="valid-2", plain_text_snapshot="第二条正文")
        db.commit()

        snapshots = reader.get_by_ids(
            db=db,
            user_id=TEST_USER_ID,
            fragment_ids=["valid-2", "deleted", "valid-1", "missing", "empty"],
        )

    assert [snapshot.id for snapshot in snapshots] == ["valid-2", "valid-1"]
    assert snapshots[0].plain_text_snapshot == "第二条正文"
    assert snapshots[1].body_html == "<p>第一条</p>"


def test_fragment_snapshot_reader_lists_deleted_ids_from_tombstone_and_payload(db_session_factory) -> None:
    """删除 ID 枚举应同时识别 delete 操作和 payload 中的 deleted_at。"""
    reader = FragmentSnapshotReader()
    with db_session_factory() as db:
        _upsert_fragment_record(db, entity_id="payload-deleted", body_html="<p>旧正文</p>", deleted_at="2026-03-25T09:00:00+00:00")
        _upsert_fragment_record(db, entity_id="operation-deleted", operation="delete")
        _upsert_fragment_record(db, entity_id="keep-me", body_html="<p>保留正文</p>")
        db.commit()

        deleted_ids = reader.list_deleted_ids(db=db, user_id=TEST_USER_ID)

    assert set(deleted_ids) == {"payload-deleted", "operation-deleted"}
