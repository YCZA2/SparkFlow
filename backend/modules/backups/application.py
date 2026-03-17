from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from domains.backups import repository as backup_repository
from modules.shared.ports import FileStorage, StoredFile
from modules.shared.infrastructure.storage import LocalFileStorage, OssFileStorage, normalize_object_key, sanitize_filename
from utils.time import ensure_aware_utc

from .schemas import (
    BackupAssetAccessRequest,
    BackupAssetAccessResponse,
    BackupAssetAccessResponseItem,
    BackupBatchRequest,
    BackupBatchResponse,
    BackupRestoreResponse,
    BackupSnapshotItem,
    BackupSnapshotResponse,
)

VALID_ENTITY_TYPES = {"fragment", "folder", "media_asset", "script"}


def _parse_datetime(value: str | None) -> datetime | None:
    """解析客户端 ISO 时间，统一转成 UTC aware datetime。"""
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return ensure_aware_utc(datetime.fromisoformat(normalized))


def _isoformat(value: datetime | None) -> str | None:
    """统一输出 ISO 时间字符串。"""
    if value is None:
        return None
    return ensure_aware_utc(value).isoformat()


class BackupUseCase:
    """封装备份批量写入、快照拉取与恢复审计。"""

    def push_batch(
        self,
        *,
        db: Session,
        user_id: str,
        payload: BackupBatchRequest,
    ) -> BackupBatchResponse:
        """按最后写入赢策略写入一批实体快照。"""
        accepted_count = 0
        ignored_count = 0
        now = datetime.now(timezone.utc)
        for item in payload.items:
            if item.entity_type not in VALID_ENTITY_TYPES:
                ignored_count += 1
                continue
            current = backup_repository.get_record(
                db=db,
                user_id=user_id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
            )
            if current is not None:
                current_modified_at = ensure_aware_utc(current.modified_at) if current.modified_at else None
                next_modified_at = _parse_datetime(item.modified_at)
                if current.entity_version > item.entity_version:
                    ignored_count += 1
                    continue
                if (
                    current.entity_version == item.entity_version
                    and current_modified_at is not None
                    and next_modified_at is not None
                    and current_modified_at > next_modified_at
                ):
                    ignored_count += 1
                    continue
            backup_repository.upsert_record(
                db=db,
                user_id=user_id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                entity_version=item.entity_version,
                operation=item.operation,
                payload_json=json.dumps(item.payload, ensure_ascii=False) if item.payload is not None else None,
                modified_at=_parse_datetime(item.modified_at),
                last_modified_device_id=item.last_modified_device_id,
                now=now,
            )
            accepted_count += 1
        db.commit()
        return BackupBatchResponse(
            accepted_count=accepted_count,
            ignored_count=ignored_count,
            server_generated_at=_isoformat(now) or "",
        )

    def get_snapshot(
        self,
        *,
        db: Session,
        user_id: str,
        since_updated_at: str | None = None,
    ) -> BackupSnapshotResponse:
        """读取当前用户的备份快照，支持按服务端更新时间增量拉取。"""
        resolved_since = _parse_datetime(since_updated_at)
        items = backup_repository.list_records(db=db, user_id=user_id, since_updated_at=resolved_since)
        now = datetime.now(timezone.utc)
        return BackupSnapshotResponse(
            items=[
                BackupSnapshotItem(
                    entity_type=item.entity_type,
                    entity_id=item.entity_id,
                    entity_version=item.entity_version,
                    operation=item.operation,
                    payload=json.loads(item.payload_json) if item.payload_json else None,
                    modified_at=_isoformat(item.modified_at),
                    last_modified_device_id=item.last_modified_device_id,
                    updated_at=_isoformat(item.updated_at),
                )
                for item in items
            ],
            server_generated_at=_isoformat(now) or "",
        )

    def create_restore_session(
        self,
        *,
        db: Session,
        user_id: str,
        device_id: str | None,
        reason: str | None,
    ) -> BackupRestoreResponse:
        """记录一次恢复行为，并返回当前快照元信息。"""
        now = datetime.now(timezone.utc)
        items = backup_repository.list_records(db=db, user_id=user_id)
        session = backup_repository.create_restore_session(
            db=db,
            user_id=user_id,
            device_id=device_id,
            reason=reason,
            snapshot_generated_at=now,
        )
        db.commit()
        return BackupRestoreResponse(
            restore_session_id=session.id,
            snapshot_generated_at=_isoformat(now) or "",
            total_items=len(items),
        )


class BackupAssetUseCase:
    """封装备份素材文件上传。"""

    def __init__(self, *, file_storage: FileStorage) -> None:
        """装配对象存储依赖。"""
        self.file_storage = file_storage

    def _build_backup_stored_file(self, *, object_key: str):
        """按当前文件存储配置重建可签名的备份对象句柄。"""
        normalized_object_key = normalize_object_key(object_key)
        if isinstance(self.file_storage, LocalFileStorage):
            return StoredFile(
                storage_provider="local",
                bucket="local",
                object_key=normalized_object_key,
                access_level="private",
                original_filename=Path(normalized_object_key).name or "backup.bin",
                mime_type="application/octet-stream",
                file_size=0,
                checksum=None,
            )
        if isinstance(self.file_storage, OssFileStorage):
            return StoredFile(
                storage_provider="oss",
                bucket=self.file_storage.bucket_name,
                object_key=normalized_object_key,
                access_level="private",
                original_filename=Path(normalized_object_key).name or "backup.bin",
                mime_type="application/octet-stream",
                file_size=0,
                checksum=None,
            )
        raise RuntimeError("unsupported file storage implementation")

    def resolve_asset_access(
        self,
        *,
        user_id: str,
        payload: BackupAssetAccessRequest,
    ) -> BackupAssetAccessResponse:
        """批量刷新备份素材的访问地址，避免客户端恢复时使用过期签名。"""
        allowed_prefixes = (
            f"backups/assets/{user_id}/",
            f"audio/original/{user_id}/",
            f"audio/imported/{user_id}/",
        )
        items: list[BackupAssetAccessResponseItem] = []
        for item in payload.items:
            object_key = normalize_object_key(item.object_key)
            if not any(object_key.startswith(prefix) for prefix in allowed_prefixes):
                raise ValidationError(
                    message="备份对象不属于当前用户",
                    field_errors={"object_key": "只允许刷新当前用户自己的备份素材或关联音频"},
                )
            access = self.file_storage.create_download_url(
                stored_file=self._build_backup_stored_file(object_key=object_key)
            )
            items.append(
                BackupAssetAccessResponseItem(
                    object_key=object_key,
                    file_url=access.url,
                    expires_at=access.expires_at,
                )
            )
        return BackupAssetAccessResponse(items=items)

    async def upload_asset(
        self,
        *,
        user_id: str,
        file: UploadFile,
        entity_type: str,
        entity_id: str,
    ):
        """保存备份素材，并返回可持久化的对象句柄。"""
        original_name = file.filename or "backup.bin"
        suffix = Path(original_name).suffix or ".bin"
        stem = sanitize_filename(Path(original_name).stem, "backup")
        object_key = f"backups/assets/{user_id}/{entity_type}/{entity_id}/{stem}{suffix}"
        saved = await self.file_storage.save_upload(
            file=file,
            object_key=object_key,
            original_filename=f"{stem}{suffix}",
            mime_type=file.content_type or "application/octet-stream",
        )
        access = self.file_storage.create_download_url(saved)
        return {
            "storage_provider": saved.storage_provider,
            "bucket": saved.bucket,
            "object_key": saved.object_key,
            "access_level": saved.access_level,
            "original_filename": saved.original_filename,
            "mime_type": saved.mime_type,
            "file_size": saved.file_size,
            "checksum": saved.checksum,
            "file_url": access.url,
            "expires_at": access.expires_at,
        }
