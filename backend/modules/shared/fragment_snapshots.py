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
    """把快照字段规整为非空字符串。"""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _read_string_list(value: Any) -> list[str]:
    """只接受字符串数组，避免脏快照污染读取结果。"""
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _parse_snapshot_datetime(value: Any) -> datetime | None:
    """解析快照中的 ISO 时间并统一转成 UTC aware datetime。"""
    normalized = _read_string(value)
    if not normalized:
        return None
    try:
        return ensure_aware_utc(datetime.fromisoformat(normalized.replace("Z", "+00:00")))
    except ValueError:
        return None


@dataclass
class FragmentSnapshot:
    """描述服务端已同步成功的 fragment 真值快照。"""

    id: str
    user_id: str
    source: str
    created_at: datetime
    updated_at: datetime
    body_html: str
    plain_text_snapshot: str
    transcript: str | None
    summary: str | None
    tags: list[str]
    folder_id: str | None
    deleted_at: str | None
    entity_version: int
    backup_updated_at: datetime


def read_fragment_snapshot_text(snapshot: FragmentSnapshot) -> str:
    """统一读取快照正文，优先正文快照，其次 HTML，再次 transcript。"""
    plain_text = (snapshot.plain_text_snapshot or "").strip()
    if plain_text:
        return plain_text
    body_text = extract_plain_text_from_html(snapshot.body_html or "")
    if body_text:
        return body_text
    return str(snapshot.transcript or "").strip()


def serialize_fragment_snapshot(snapshot: FragmentSnapshot) -> dict[str, Any]:
    """把快照 DTO 序列化为可写入 pipeline 输入的字典。"""
    payload = asdict(snapshot)
    payload["created_at"] = snapshot.created_at.isoformat()
    payload["updated_at"] = snapshot.updated_at.isoformat()
    payload["backup_updated_at"] = snapshot.backup_updated_at.isoformat()
    return payload


def hydrate_fragment_snapshot(item: dict[str, Any], *, user_id: str) -> FragmentSnapshot | None:
    """把 pipeline 输入中的字典恢复为标准快照 DTO。"""
    snapshot_id = str(item.get("id") or "").strip()
    if not snapshot_id:
        return None
    fallback_time = ensure_aware_utc()
    return FragmentSnapshot(
        id=snapshot_id,
        user_id=str(item.get("user_id") or user_id),
        source=str(item.get("source") or "manual"),
        created_at=_parse_snapshot_datetime(item.get("created_at")) or fallback_time,
        updated_at=_parse_snapshot_datetime(item.get("updated_at")) or fallback_time,
        body_html=str(item.get("body_html") or ""),
        plain_text_snapshot=str(item.get("plain_text_snapshot") or "").strip(),
        transcript=_read_string(item.get("transcript")),
        summary=_read_string(item.get("summary")),
        tags=_read_string_list(item.get("tags")),
        folder_id=_read_string(item.get("folder_id")),
        deleted_at=_read_string(item.get("deleted_at")),
        entity_version=int(item.get("entity_version") or 1),
        backup_updated_at=_parse_snapshot_datetime(item.get("backup_updated_at")) or fallback_time,
    )


class FragmentSnapshotReader:
    """从备份快照中读取 fragment 真值，供内部模块统一复用。"""

    def get_by_id(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
    ) -> FragmentSnapshot | None:
        """按 ID 读取单条可用的 fragment 快照。"""
        record = backup_repository.get_record(
            db=db,
            user_id=user_id,
            entity_type="fragment",
            entity_id=fragment_id,
        )
        if record is None:
            return None
        return self._build_fragment_snapshot(record=record)

    def get_by_ids(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
    ) -> list[FragmentSnapshot]:
        """按输入顺序批量读取 fragment 快照。"""
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        record_map = {record.entity_id: record for record in records}
        snapshots: list[FragmentSnapshot] = []
        for fragment_id in fragment_ids:
            snapshot = self._build_fragment_snapshot(record=record_map.get(fragment_id))
            if snapshot is not None:
                snapshots.append(snapshot)
        return snapshots

    def list_by_time_window(
        self,
        *,
        db: Session,
        user_id: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[FragmentSnapshot]:
        """读取目标时间窗内可用于消费的 fragment 快照。"""
        snapshots: list[FragmentSnapshot] = []
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        for record in records:
            snapshot = self._build_fragment_snapshot(record=record)
            if snapshot is None:
                continue
            if not (start_at <= snapshot.created_at < end_at):
                continue
            snapshots.append(snapshot)
        return sorted(snapshots, key=lambda item: item.created_at)

    def list_vectorizable_by_user(
        self,
        *,
        db: Session,
        user_id: str,
    ) -> list[FragmentSnapshot]:
        """枚举当前用户全部可向量化的 fragment 快照。"""
        snapshots: list[FragmentSnapshot] = []
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        for record in records:
            snapshot = self._build_fragment_snapshot(record=record)
            if snapshot is not None:
                snapshots.append(snapshot)
        snapshots.sort(key=lambda item: (item.created_at, item.id))
        return snapshots

    def list_user_ids(self, *, db: Session) -> list[str]:
        """枚举存在 fragment backup 记录的用户集合。"""
        return list(
            backup_repository.list_user_ids_by_entity_type(
                db=db,
                entity_type="fragment",
                operation="upsert",
            )
        )

    def list_snapshots_and_deleted_ids(
        self,
        *,
        db: Session,
        user_id: str,
    ) -> tuple[list[FragmentSnapshot], list[str]]:
        """单次扫描同时返回可向量化快照与已删除 ID，避免双重 DB 查询。"""
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        snapshots: list[FragmentSnapshot] = []
        deleted_ids: list[str] = []
        for record in records:
            if record.operation == "delete":
                deleted_ids.append(record.entity_id)
                continue
            snapshot = self._build_fragment_snapshot(record=record)
            if snapshot is not None:
                snapshots.append(snapshot)
            else:
                # 区分 deleted_at 标记删除（需加入已删 ID）与正文为空（直接跳过）
                try:
                    payload = json.loads(record.payload_json or "")
                    if isinstance(payload, dict) and _read_string(payload.get("deleted_at")):
                        deleted_ids.append(record.entity_id)
                except json.JSONDecodeError:
                    pass
        snapshots.sort(key=lambda item: (item.created_at, item.id))
        return snapshots, deleted_ids

    def list_deleted_ids(
        self,
        *,
        db: Session,
        user_id: str,
    ) -> list[str]:
        """枚举当前用户已被 tombstone 或 deleted_at 标记删除的 fragment ID。"""
        deleted_ids: list[str] = []
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        for record in records:
            if record.operation == "delete":
                deleted_ids.append(record.entity_id)
                continue
            try:
                payload = json.loads(record.payload_json or "")
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and _read_string(payload.get("deleted_at")):
                deleted_ids.append(record.entity_id)
        return deleted_ids

    def _build_fragment_snapshot(self, *, record) -> FragmentSnapshot | None:
        """把备份记录规整为统一的 fragment 快照。"""
        if record is None or record.operation != "upsert" or not record.payload_json:
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
        snapshot = FragmentSnapshot(
            id=record.entity_id,
            user_id=record.user_id,
            source=_read_string(payload.get("source")) or "manual",
            created_at=(
                _parse_snapshot_datetime(payload.get("created_at"))
                or _parse_snapshot_datetime(payload.get("updated_at"))
                or ensure_aware_utc(record.modified_at)
                or ensure_aware_utc(record.updated_at)
            ),
            updated_at=(
                _parse_snapshot_datetime(payload.get("updated_at"))
                or ensure_aware_utc(record.modified_at)
                or ensure_aware_utc(record.updated_at)
            ),
            body_html=body_html,
            plain_text_snapshot=_read_string(payload.get("plain_text_snapshot")) or "",
            transcript=_read_string(payload.get("transcript")),
            summary=_read_string(payload.get("summary")),
            tags=_read_string_list(payload.get("tags")),
            folder_id=_read_string(payload.get("folder_id")),
            deleted_at=deleted_at,
            entity_version=record.entity_version,
            backup_updated_at=ensure_aware_utc(record.updated_at),
        )
        if not read_fragment_snapshot_text(snapshot):
            return None
        return snapshot
