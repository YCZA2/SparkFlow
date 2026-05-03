from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from domains.backups import repository as backup_repository
from modules.shared.content.body_service import extract_plain_text_from_html
from utils.time import ensure_aware_utc

FRAGMENT_PURPOSES = {
    "content_material",
    "style_reference",
    "methodology",
    "case_study",
    "product_info",
    "other",
}


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


def normalize_fragment_purpose(value: Any) -> str | None:
    """把任意输入规整为当前支持的 fragment 主要用途。"""
    normalized = _read_string(value)
    return normalized if normalized in FRAGMENT_PURPOSES else None


def effective_fragment_purpose(snapshot: "FragmentSnapshot") -> str:
    """读取生成时真正采用的用途，仅依赖系统自动判断，不再读取用户修正。"""
    return snapshot.system_purpose or "other"


def effective_fragment_tags(snapshot: "FragmentSnapshot") -> list[str]:
    """合并用户标签和未删除系统建议标签，兼容旧 tags 字段。"""
    dismissed = set(snapshot.dismissed_system_tags)
    tags: list[str] = []
    for tag in [*snapshot.tags, *snapshot.user_tags, *snapshot.system_tags]:
        if tag in dismissed or tag in tags:
            continue
        tags.append(tag)
    return tags


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
    audio_source: str | None
    created_at: datetime
    updated_at: datetime
    body_html: str
    plain_text_snapshot: str
    transcript: str | None
    speaker_segments: list[dict[str, Any]] | None
    summary: str | None
    tags: list[str]
    system_purpose: str | None
    user_purpose: str | None
    system_tags: list[str]
    user_tags: list[str]
    dismissed_system_tags: list[str]
    audio_object_key: str | None
    audio_file_url: str | None
    audio_file_expires_at: str | None
    folder_id: str | None
    content_state: str | None
    is_filmed: bool
    filmed_at: str | None
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
    """把快照 DTO 序列化为可写入任务输入的字典。"""
    payload = asdict(snapshot)
    payload["created_at"] = snapshot.created_at.isoformat()
    payload["updated_at"] = snapshot.updated_at.isoformat()
    payload["backup_updated_at"] = snapshot.backup_updated_at.isoformat()
    return payload


def hydrate_fragment_snapshot(item: dict[str, Any], *, user_id: str) -> FragmentSnapshot | None:
    """把任务输入中的字典恢复为标准快照 DTO。"""
    snapshot_id = str(item.get("id") or "").strip()
    if not snapshot_id:
        return None
    fallback_time = ensure_aware_utc()
    return FragmentSnapshot(
        id=snapshot_id,
        user_id=str(item.get("user_id") or user_id),
        source=str(item.get("source") or "manual"),
        audio_source=_read_string(item.get("audio_source")),
        created_at=_parse_snapshot_datetime(item.get("created_at")) or fallback_time,
        updated_at=_parse_snapshot_datetime(item.get("updated_at")) or fallback_time,
        body_html=str(item.get("body_html") or ""),
        plain_text_snapshot=str(item.get("plain_text_snapshot") or "").strip(),
        transcript=_read_string(item.get("transcript")),
        speaker_segments=_read_speaker_segments(item.get("speaker_segments")),
        summary=_read_string(item.get("summary")),
        tags=_read_string_list(item.get("tags")),
        system_purpose=normalize_fragment_purpose(item.get("system_purpose")),
        user_purpose=normalize_fragment_purpose(item.get("user_purpose")),
        system_tags=_read_string_list(item.get("system_tags")) or _read_string_list(item.get("tags")),
        user_tags=_read_string_list(item.get("user_tags")),
        dismissed_system_tags=_read_string_list(item.get("dismissed_system_tags")),
        audio_object_key=_read_string(item.get("audio_object_key")),
        audio_file_url=_read_string(item.get("audio_file_url")),
        audio_file_expires_at=_read_string(item.get("audio_file_expires_at")),
        folder_id=_read_string(item.get("folder_id")),
        content_state=_read_string(item.get("content_state")),
        is_filmed=bool(item.get("is_filmed")),
        filmed_at=_read_string(item.get("filmed_at")),
        deleted_at=_read_string(item.get("deleted_at")),
        entity_version=int(item.get("entity_version") or 1),
        backup_updated_at=_parse_snapshot_datetime(item.get("backup_updated_at")) or fallback_time,
    )


SERVER_MANAGED_FRAGMENT_FIELDS = {
    "transcript",
    "speaker_segments",
    "summary",
    "tags",
    "system_purpose",
    "system_tags",
    "audio_object_key",
    "audio_file_url",
    "audio_file_expires_at",
}


def _read_speaker_segments(value: Any) -> list[dict[str, Any]] | None:
    """把说话人分段规整为稳定的字典列表。"""
    if not isinstance(value, list):
        return None
    normalized: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            normalized.append(dict(item))
    return normalized or None


def _read_payload_dict(value: str | None) -> dict[str, Any]:
    """把备份 payload JSON 安全反序列化为字典。"""
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _is_missing_server_value(value: Any) -> bool:
    """判断客户端上送的服务器字段是否缺失，缺失时需保留旧值。"""
    return value is None or value == "" or value == []


def merge_fragment_snapshot_server_fields(
    *,
    existing_payload: dict[str, Any] | None,
    incoming_payload: dict[str, Any] | None = None,
    server_patch: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """合并 fragment snapshot，并保护服务器拥有字段不被客户端旧快照覆盖。"""
    merged = dict(existing_payload or {})
    next_payload = dict(incoming_payload or {})
    merged.update(next_payload)

    for field in SERVER_MANAGED_FRAGMENT_FIELDS:
        if existing_payload and field in existing_payload and not _is_missing_server_value(existing_payload.get(field)):
            merged[field] = existing_payload[field]
            continue
        if field in next_payload and not _is_missing_server_value(next_payload.get(field)):
            continue

    for field, value in (server_patch or {}).items():
        if field not in SERVER_MANAGED_FRAGMENT_FIELDS:
            continue
        merged[field] = value

    return merged


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
        return self._build_fragment_snapshot(record=record, require_text=False)

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
            snapshot = self._build_fragment_snapshot(record=record_map.get(fragment_id), require_text=False)
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
            if not read_fragment_snapshot_text(snapshot):
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
            if snapshot is not None and read_fragment_snapshot_text(snapshot):
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
            snapshot = self._build_fragment_snapshot(record=record, require_text=False)
            if snapshot is not None and read_fragment_snapshot_text(snapshot):
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

    def get_raw_payload_by_id(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
    ) -> dict[str, Any] | None:
        """读取单条 fragment 的原始 snapshot payload。"""
        record = backup_repository.get_record(
            db=db,
            user_id=user_id,
            entity_type="fragment",
            entity_id=fragment_id,
        )
        if record is None or record.operation != "upsert":
            return None
        payload = _read_payload_dict(record.payload_json)
        if _read_string(payload.get("deleted_at")):
            return None
        return payload

    def list_raw_payloads(
        self,
        *,
        db: Session,
        user_id: str,
    ) -> list[dict[str, Any]]:
        """枚举当前用户全部未删除的 fragment snapshot 原始 payload。"""
        payloads: list[dict[str, Any]] = []
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="fragment",
        )
        for record in records:
            if record.operation != "upsert":
                continue
            payload = _read_payload_dict(record.payload_json)
            if _read_string(payload.get("deleted_at")):
                continue
            payloads.append(payload)
        return payloads

    def merge_server_fields(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
        server_patch: dict[str, Any],
        snapshot_patch: dict[str, Any] | None = None,
        source: str = "voice",
        audio_source: str | None = None,
        client_seed: dict[str, Any] | None = None,
    ) -> None:
        """把服务器生成字段合并补写到 fragment snapshot。"""
        record = backup_repository.get_record(
            db=db,
            user_id=user_id,
            entity_type="fragment",
            entity_id=fragment_id,
        )
        existing_payload = _read_payload_dict(record.payload_json if record is not None else None)
        seed_payload = dict(client_seed or {})
        now = ensure_aware_utc()
        base_payload = dict(existing_payload)
        base_payload["id"] = fragment_id
        base_payload["source"] = _read_string(base_payload.get("source")) or source
        base_payload["audio_source"] = _read_string(base_payload.get("audio_source")) or audio_source
        base_payload["created_at"] = (
            base_payload.get("created_at")
            or seed_payload.get("created_at")
            or base_payload.get("updated_at")
            or now.isoformat()
        )
        base_payload["updated_at"] = now.isoformat()
        base_payload["body_html"] = str(base_payload.get("body_html") or seed_payload.get("body_html") or "")
        base_payload["plain_text_snapshot"] = str(
            base_payload.get("plain_text_snapshot") or seed_payload.get("plain_text_snapshot") or ""
        )
        base_payload["folder_id"] = base_payload.get("folder_id") or seed_payload.get("folder_id")
        base_payload["content_state"] = base_payload.get("content_state") or seed_payload.get("content_state")
        base_payload["is_filmed"] = bool(base_payload.get("is_filmed"))
        base_payload["filmed_at"] = base_payload.get("filmed_at")
        base_payload["deleted_at"] = base_payload.get("deleted_at")
        merged_payload = merge_fragment_snapshot_server_fields(
            existing_payload=base_payload,
            server_patch=server_patch,
        )
        # 中文注释：部分服务端链路需要补写正文/状态等结构字段，它们不属于受保护的服务器拥有字段。
        if snapshot_patch:
            merged_payload.update(snapshot_patch)
        backup_repository.upsert_record(
            db=db,
            user_id=user_id,
            entity_type="fragment",
            entity_id=fragment_id,
            entity_version=record.entity_version if record is not None else 1,
            operation="upsert",
            payload_json=json.dumps(merged_payload, ensure_ascii=False),
            modified_at=ensure_aware_utc(record.modified_at) if record is not None and record.modified_at else None,
            last_modified_device_id=record.last_modified_device_id if record is not None else None,
            now=now,
        )
        db.commit()

    def _build_fragment_snapshot(self, *, record, require_text: bool = True) -> FragmentSnapshot | None:
        """把备份记录规整为统一的 fragment 快照。"""
        if record is None or record.operation != "upsert" or not record.payload_json:
            return None
        payload = _read_payload_dict(record.payload_json)
        if not payload:
            return None
        deleted_at = _read_string(payload.get("deleted_at"))
        if deleted_at:
            return None
        body_html = _read_string(payload.get("body_html")) or ""
        snapshot = FragmentSnapshot(
            id=record.entity_id,
            user_id=record.user_id,
            source=_read_string(payload.get("source")) or "manual",
            audio_source=_read_string(payload.get("audio_source")),
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
            speaker_segments=_read_speaker_segments(payload.get("speaker_segments")),
            summary=_read_string(payload.get("summary")),
            tags=_read_string_list(payload.get("tags")),
            system_purpose=normalize_fragment_purpose(payload.get("system_purpose")),
            user_purpose=normalize_fragment_purpose(payload.get("user_purpose")),
            system_tags=_read_string_list(payload.get("system_tags")) or _read_string_list(payload.get("tags")),
            user_tags=_read_string_list(payload.get("user_tags")),
            dismissed_system_tags=_read_string_list(payload.get("dismissed_system_tags")),
            audio_object_key=_read_string(payload.get("audio_object_key")),
            audio_file_url=_read_string(payload.get("audio_file_url")),
            audio_file_expires_at=_read_string(payload.get("audio_file_expires_at")),
            folder_id=_read_string(payload.get("folder_id")),
            content_state=_read_string(payload.get("content_state")),
            is_filmed=bool(payload.get("is_filmed")),
            filmed_at=_read_string(payload.get("filmed_at")),
            deleted_at=deleted_at,
            entity_version=record.entity_version,
            backup_updated_at=ensure_aware_utc(record.updated_at),
        )
        if require_text and not read_fragment_snapshot_text(snapshot):
            return None
        return snapshot
