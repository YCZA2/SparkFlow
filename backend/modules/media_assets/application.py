from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.media_assets import repository as media_asset_repository
from models import generate_uuid
from modules.fragments.mapper import build_media_asset_file, map_media_asset
from modules.shared.storage import build_media_asset_object_key, sanitize_filename, validate_media_upload
from modules.shared.ports import FileStorage
from .schemas import MediaAssetListResponse, MediaAssetUploadResponse

VALID_MEDIA_KINDS = {"image", "audio", "file"}


class MediaAssetUseCase:
    """封装媒体资源上传、查询和删除能力。"""

    def __init__(self, *, storage: FileStorage) -> None:
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
        content = await file.read()
        ext, mime_type = validate_media_upload(file, normalized_kind, content)
        if hasattr(file.file, "seek"):
            file.file.seek(0)
        asset_id = generate_uuid()
        stem = sanitize_filename(Path(file.filename or normalized_kind).stem, normalized_kind)
        saved = await self.storage.save_upload(
            file=file,
            object_key=build_media_asset_object_key(user_id=user_id, asset_id=asset_id, filename=f"{stem}{ext}"),
            original_filename=file.filename or f"{stem}{ext}",
            mime_type=mime_type,
        )
        asset = media_asset_repository.create(
            db=db,
            asset_id=asset_id,
            user_id=user_id,
            media_kind=normalized_kind,
            original_filename=saved.original_filename,
            mime_type=saved.mime_type,
            storage_provider=saved.storage_provider,
            bucket=saved.bucket,
            object_key=saved.object_key,
            access_level=saved.access_level,
            file_size=saved.file_size,
            checksum=saved.checksum,
        )
        access = self.storage.create_download_url(saved)
        payload = map_media_asset(asset)
        return MediaAssetUploadResponse(**payload.model_dump(), file_url=access.url, expires_at=access.expires_at)

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
        payload_items = []
        for item in items:
            access = self.storage.create_download_url(build_media_asset_file(item))
            payload_items.append(MediaAssetUploadResponse(**map_media_asset(item).model_dump(), file_url=access.url, expires_at=access.expires_at))
        return MediaAssetListResponse(
            items=payload_items,
            total=len(items),
            limit=limit,
            offset=offset,
        )

    def delete_asset(self, *, db: Session, user_id: str, asset_id: str) -> None:
        """删除媒体资源及对应对象文件。"""
        asset = media_asset_repository.get_by_id(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            raise NotFoundError(message="媒体资源不存在或无权访问", resource_type="media_asset", resource_id=asset_id)
        self.storage.delete(build_media_asset_file(asset))
        media_asset_repository.delete(db=db, asset=asset)
