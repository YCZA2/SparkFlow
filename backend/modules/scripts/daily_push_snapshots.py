from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from domains.backups import repository as backup_repository
from modules.shared.content.content_html import extract_plain_text_from_html
from utils.time import ensure_aware_utc


def _read_string(value: Any) -> str | None:
    """把快照 payload 中的字段规整为非空字符串。"""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _read_string_list(value: Any) -> list[str]:
    """只接受字符串数组，避免脏快照污染推盘输入。"""
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _parse_snapshot_datetime(value: Any) -> datetime | None:
    """解析快照里的 ISO 时间，统一转换为 UTC aware datetime。"""
    normalized = _read_string(value)
    if not normalized:
        return None
    return ensure_aware_utc(datetime.fromisoformat(normalized.replace("Z", "+00:00")))


@dataclass
class DailyPushFragmentSnapshot:
    """描述每日推盘读取到的 fragment 备份快照。"""

    id: str
    user_id: str
    source: str
    created_at: datetime
    updated_at: datetime
    plain_text: str
    summary: str | None
    tags: list[str]
    entity_version: int
    backup_updated_at: datetime


class DailyPushSnapshotReader:
    """从备份快照中提取每日推盘所需的 fragment 真值。"""

    def list_fragment_snapshots(
        self,
        *,
        db: Session,
        user_id: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[DailyPushFragmentSnapshot]:
        """读取目标时间窗内可用于推盘的 fragment 快照。"""
        snapshots: list[DailyPushFragmentSnapshot] = []
        records = backup_repository.list_records_by_entity_type(db=db, user_id=user_id, entity_type="fragment")
        for record in records:
            snapshot = self._build_fragment_snapshot(record=record)
            if snapshot is None:
                continue
            if not (start_at <= snapshot.created_at < end_at):
                continue
            snapshots.append(snapshot)
        return sorted(snapshots, key=lambda item: item.created_at)

    def list_recent_fragment_snapshots(
        self,
        *,
        db: Session,
        user_id: str,
        limit: int,
    ) -> list[DailyPushFragmentSnapshot]:
        """读取最近可用的 fragment 快照，供手动触发兜底。"""
        snapshots: list[DailyPushFragmentSnapshot] = []
        records = backup_repository.list_records_by_entity_type(db=db, user_id=user_id, entity_type="fragment")
        for record in records:
            snapshot = self._build_fragment_snapshot(record=record)
            if snapshot is not None:
                snapshots.append(snapshot)
        snapshots.sort(key=lambda item: item.created_at)
        return snapshots[-limit:]

    def list_user_ids(self, *, db: Session) -> list[str]:
        """枚举存在 fragment 备份快照的用户集合。"""
        return backup_repository.list_user_ids_by_entity_type(db=db, entity_type="fragment", operation="upsert")

    @staticmethod
    def serialize_snapshots(snapshots: list[DailyPushFragmentSnapshot]) -> list[dict[str, Any]]:
        """把快照 DTO 转成可写入 pipeline 输入的纯字典。"""
        items: list[dict[str, Any]] = []
        for snapshot in snapshots:
            payload = asdict(snapshot)
            payload["created_at"] = snapshot.created_at.isoformat()
            payload["updated_at"] = snapshot.updated_at.isoformat()
            payload["backup_updated_at"] = snapshot.backup_updated_at.isoformat()
            items.append(payload)
        return items

    def _build_fragment_snapshot(self, *, record) -> DailyPushFragmentSnapshot | None:
        """把备份记录规整为可供推盘使用的 fragment 快照。"""
        if record.operation != "upsert" or not record.payload_json:
            return None
        try:
            payload = json.loads(record.payload_json)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        deleted_at = _read_string(payload.get("deleted_at"))
        if deleted_at:
            return None
        body_html = _read_string(payload.get("body_html")) or ""
        transcript = _read_string(payload.get("transcript"))
        plain_text = (
            _read_string(payload.get("plain_text_snapshot"))
            or extract_plain_text_from_html(body_html)
            or transcript
            or ""
        ).strip()
        if not plain_text:
            return None
        created_at = (
            _parse_snapshot_datetime(payload.get("created_at"))
            or _parse_snapshot_datetime(payload.get("updated_at"))
            or ensure_aware_utc(record.modified_at)
            or ensure_aware_utc(record.updated_at)
        )
        updated_at = (
            _parse_snapshot_datetime(payload.get("updated_at"))
            or ensure_aware_utc(record.modified_at)
            or ensure_aware_utc(record.updated_at)
        )
        return DailyPushFragmentSnapshot(
            id=record.entity_id,
            user_id=record.user_id,
            source=_read_string(payload.get("source")) or "manual",
            created_at=created_at,
            updated_at=updated_at,
            plain_text=plain_text,
            summary=_read_string(payload.get("summary")),
            tags=_read_string_list(payload.get("tags")),
            entity_version=record.entity_version,
            backup_updated_at=ensure_aware_utc(record.updated_at),
        )
