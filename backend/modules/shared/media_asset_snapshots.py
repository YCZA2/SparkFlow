from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from domains.backups import repository as backup_repository
from modules.shared.content.content_schemas import MediaAssetItem
from modules.shared.infrastructure.storage import build_stored_file_from_object_key
from modules.shared.ports import FileStorage, StoredFile
from utils.time import ensure_aware_utc

from .fragment_snapshots import _parse_snapshot_datetime, _read_payload_dict, _read_string


def _read_int(value: Any) -> int | None:
    """把数字字段规整为整数，避免脏快照影响导出和展示。"""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


@dataclass
class MediaAssetSnapshot:
    """描述由 backup snapshot 恢复出的媒体素材。"""

    id: str
    fragment_id: str
    media_kind: str
    original_filename: str
    mime_type: str
    backup_object_key: str | None
    backup_file_url: str | None
    remote_expires_at: str | None
    upload_status: str
    file_size: int
    checksum: str | None
    width: int | None
    height: int | None
    duration_ms: int | None
    created_at: datetime


def build_media_asset_snapshot_file(
    *,
    file_storage: FileStorage,
    asset: MediaAssetSnapshot,
) -> StoredFile | None:
    """按 backup 对象键恢复素材文件句柄。"""
    if not asset.backup_object_key:
        return None
    return build_stored_file_from_object_key(
        file_storage=file_storage,
        object_key=asset.backup_object_key,
        original_filename=asset.original_filename,
        mime_type=asset.mime_type,
    )


def map_media_asset_snapshot(
    asset: MediaAssetSnapshot,
    *,
    file_storage: FileStorage | None = None,
) -> MediaAssetItem:
    """把素材 snapshot 映射为统一响应结构。"""
    file_url = asset.backup_file_url
    expires_at = asset.remote_expires_at
    if file_storage is not None:
        stored_file = build_media_asset_snapshot_file(file_storage=file_storage, asset=asset)
        if stored_file is not None:
            access = file_storage.create_download_url(stored_file)
            file_url = access.url
            expires_at = access.expires_at
    return MediaAssetItem(
        id=asset.id,
        media_kind=asset.media_kind,
        original_filename=asset.original_filename,
        mime_type=asset.mime_type,
        file_size=asset.file_size,
        checksum=asset.checksum,
        width=asset.width,
        height=asset.height,
        duration_ms=asset.duration_ms,
        status=asset.upload_status,
        created_at=asset.created_at.isoformat(),
        file_url=file_url,
        expires_at=expires_at,
    )


class MediaAssetSnapshotReader:
    """从 backup snapshot 中读取 fragment 关联素材。"""

    def list_by_fragment_id(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
    ) -> list[MediaAssetSnapshot]:
        """扫描当前用户素材快照，并按 fragment_id 过滤。"""
        assets: list[MediaAssetSnapshot] = []
        records = backup_repository.list_records_by_entity_type(
            db=db,
            user_id=user_id,
            entity_type="media_asset",
        )
        for record in records:
            if record.operation != "upsert":
                continue
            payload = _read_payload_dict(record.payload_json)
            if _read_string(payload.get("deleted_at")):
                continue
            if _read_string(payload.get("fragment_id")) != fragment_id:
                continue
            asset = self._build_asset_snapshot(payload=payload)
            if asset is not None:
                assets.append(asset)
        assets.sort(key=lambda item: (item.created_at, item.id))
        return assets

    @staticmethod
    def _build_asset_snapshot(*, payload: dict[str, Any]) -> MediaAssetSnapshot | None:
        """把媒体 payload 规整为稳定 DTO。"""
        asset_id = _read_string(payload.get("id"))
        fragment_id = _read_string(payload.get("fragment_id"))
        media_kind = _read_string(payload.get("media_kind"))
        original_filename = _read_string(payload.get("file_name"))
        mime_type = _read_string(payload.get("mime_type"))
        if not asset_id or not fragment_id or not media_kind or not original_filename or not mime_type:
            return None
        return MediaAssetSnapshot(
            id=asset_id,
            fragment_id=fragment_id,
            media_kind=media_kind,
            original_filename=original_filename,
            mime_type=mime_type,
            backup_object_key=_read_string(payload.get("backup_object_key")),
            backup_file_url=_read_string(payload.get("backup_file_url")),
            remote_expires_at=_read_string(payload.get("remote_expires_at")),
            upload_status=_read_string(payload.get("upload_status")) or "ready",
            file_size=_read_int(payload.get("file_size")) or 0,
            checksum=_read_string(payload.get("checksum")),
            width=_read_int(payload.get("width")),
            height=_read_int(payload.get("height")),
            duration_ms=_read_int(payload.get("duration_ms")),
            created_at=_parse_snapshot_datetime(payload.get("created_at")) or ensure_aware_utc(),
        )
