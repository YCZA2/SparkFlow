from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class BackupMutationItem(BaseModel):
    entity_type: Literal["fragment", "folder", "media_asset", "script"] = Field(..., description="备份实体类型")
    entity_id: str = Field(..., description="本地实体 ID")
    entity_version: int = Field(..., ge=1, description="客户端实体版本号")
    operation: Literal["upsert", "delete"] = Field(..., description="写入或 tombstone 操作")
    payload: dict[str, Any] | None = Field(None, description="实体快照；delete 时可为空")
    modified_at: str | None = Field(None, description="客户端最后修改时间")
    last_modified_device_id: str | None = Field(None, description="最后修改该实体的设备 ID")


class BackupBatchRequest(BaseModel):
    items: list[BackupMutationItem] = Field(..., min_length=1, max_length=500, description="待推送的备份变更")


class BackupBatchResponse(BaseModel):
    accepted_count: int
    ignored_count: int
    server_generated_at: str


class BackupSnapshotItem(BaseModel):
    entity_type: str
    entity_id: str
    entity_version: int
    operation: str
    payload: dict[str, Any] | None = None
    modified_at: str | None = None
    last_modified_device_id: str | None = None
    updated_at: str | None = None


class BackupSnapshotResponse(BaseModel):
    items: list[BackupSnapshotItem] = Field(default_factory=list)
    server_generated_at: str


class BackupRestoreRequest(BaseModel):
    reason: str | None = Field(None, description="触发恢复的原因")


class BackupRestoreResponse(BaseModel):
    restore_session_id: str
    snapshot_generated_at: str
    total_items: int


class BackupAssetUploadResponse(BaseModel):
    storage_provider: str
    bucket: str
    object_key: str
    access_level: str
    original_filename: str
    mime_type: str
    file_size: int
    checksum: str | None = None
    file_url: str
    expires_at: str | None = None


class BackupAssetAccessRequestItem(BaseModel):
    object_key: str = Field(..., description="需要刷新访问地址的备份对象键")


class BackupAssetAccessRequest(BaseModel):
    items: list[BackupAssetAccessRequestItem] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="待刷新签名地址的备份对象列表",
    )


class BackupAssetAccessResponseItem(BaseModel):
    object_key: str
    file_url: str
    expires_at: str | None = None


class BackupAssetAccessResponse(BaseModel):
    items: list[BackupAssetAccessResponseItem] = Field(default_factory=list)
