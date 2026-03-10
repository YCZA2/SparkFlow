from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.media_assets import repository as media_asset_repository
from modules.fragments.application import map_media_asset
from modules.shared.ports import MediaAssetStorage
from .schemas import MediaAssetListResponse, MediaAssetUploadResponse

VALID_MEDIA_KINDS = {"image", "audio", "file"}


class MediaAssetUseCase:
    """封装媒体资源上传、查询和删除能力。"""

    def __init__(self, *, storage: MediaAssetStorage) -> None:
        """装配媒体资源存储依赖。"""
        self.storage = storage

    async def upload(
        self,
        *,
        db: Session,
        user_id: str,
        file: UploadFile,
        media_kind: str,
    ) -> MediaAssetUploadResponse:
        """保存媒体文件并创建元数据记录。"""
        normalized_kind = media_kind.strip().lower()
        if normalized_kind not in VALID_MEDIA_KINDS:
            raise ValidationError(message="无效的媒体类型", field_errors={"media_kind": "必须是 image、audio 或 file"})
        saved = await self.storage.save(file=file, user_id=user_id, media_kind=normalized_kind)
        asset = media_asset_repository.create(
            db=db,
            user_id=user_id,
            media_kind=normalized_kind,
            original_filename=saved["original_filename"],
            mime_type=saved["mime_type"],
            storage_path=saved["relative_path"],
            file_size=saved["file_size"],
            checksum=saved["checksum"],
        )
        payload = map_media_asset(asset)
        return MediaAssetUploadResponse(**payload.model_dump(), public_url=f"/{asset.storage_path}")

    def list_assets(
        self,
        *,
        db: Session,
        user_id: str,
        media_kind: str | None,
        limit: int,
        offset: int,
    ) -> MediaAssetListResponse:
        """分页返回当前用户的媒体资源。"""
        items = media_asset_repository.list_by_user(
            db=db,
            user_id=user_id,
            media_kind=media_kind,
            limit=limit,
            offset=offset,
        )
        return MediaAssetListResponse(
            items=[map_media_asset(item) for item in items],
            total=len(items),
            limit=limit,
            offset=offset,
        )

    def delete_asset(self, *, db: Session, user_id: str, asset_id: str) -> None:
        """删除媒体资源及对应本地文件。"""
        asset = media_asset_repository.get_by_id(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            raise NotFoundError(message="媒体资源不存在或无权访问", resource_type="media_asset", resource_id=asset_id)
        self.storage.delete(asset.storage_path)
        media_asset_repository.delete(db=db, asset=asset)
