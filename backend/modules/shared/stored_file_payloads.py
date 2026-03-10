from __future__ import annotations

from pathlib import Path
from typing import Any

from .ports import StoredFile


def stored_file_to_payload(stored_file: StoredFile | None) -> dict[str, Any] | None:
    """把统一文件元数据转换为可持久化 payload。"""
    if stored_file is None:
        return None
    return {
        "storage_provider": stored_file.storage_provider,
        "bucket": stored_file.bucket,
        "object_key": stored_file.object_key,
        "access_level": stored_file.access_level,
        "original_filename": stored_file.original_filename,
        "mime_type": stored_file.mime_type,
        "file_size": stored_file.file_size,
        "checksum": stored_file.checksum,
    }


def stored_file_from_payload(payload: dict[str, Any] | None) -> StoredFile | None:
    """从流水线 payload 恢复统一文件元数据。"""
    if not payload:
        return None
    object_key = payload.get("object_key")
    storage_provider = payload.get("storage_provider")
    bucket = payload.get("bucket")
    if not object_key or not storage_provider or not bucket:
        return None
    return StoredFile(
        storage_provider=storage_provider,
        bucket=bucket,
        object_key=object_key,
        access_level=payload.get("access_level") or "private",
        original_filename=payload.get("original_filename") or Path(object_key).name,
        mime_type=payload.get("mime_type") or "application/octet-stream",
        file_size=int(payload.get("file_size") or 0),
        checksum=payload.get("checksum"),
    )
