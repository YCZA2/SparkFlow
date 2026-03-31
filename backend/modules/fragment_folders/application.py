from __future__ import annotations

from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.exceptions import ConflictError, NotFoundError, ValidationError
from models import FragmentFolder
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from utils.serialization import format_iso_datetime

from domains.fragment_folders import repository as fragment_folder_repository
from .schemas import FragmentFolderItem, FragmentFolderListResponse

MAX_FOLDER_NAME_LENGTH = 50
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


def map_fragment_folder(folder: FragmentFolder, *, fragment_count: int = 0) -> FragmentFolderItem:
    return FragmentFolderItem(
        id=folder.id,
        name=folder.name,
        fragment_count=fragment_count,
        created_at=format_iso_datetime(folder.created_at),
        updated_at=format_iso_datetime(folder.updated_at),
    )


def normalize_folder_name(name: str) -> str:
    normalized = str(name or "").strip()
    if not normalized:
        raise ValidationError(message="文件夹名称不能为空", field_errors={"name": "请输入文件夹名称"})
    if len(normalized) > MAX_FOLDER_NAME_LENGTH:
        raise ValidationError(
            message="文件夹名称过长",
            field_errors={"name": f"文件夹名称不能超过 {MAX_FOLDER_NAME_LENGTH} 个字符"},
        )
    return normalized


class FragmentFolderQueryService:
    def list_folders(self, *, db: Session, user_id: str) -> FragmentFolderListResponse:
        folders = fragment_folder_repository.list_by_user(db=db, user_id=user_id)
        counts: dict[str, int] = {}
        for payload in _FRAGMENT_SNAPSHOT_READER.list_raw_payloads(db=db, user_id=user_id):
            folder_id = str(payload.get("folder_id") or "").strip()
            if folder_id:
                counts[folder_id] = counts.get(folder_id, 0) + 1
        items = [map_fragment_folder(folder, fragment_count=counts.get(folder.id, 0)) for folder in folders]
        return FragmentFolderListResponse(items=items, total=len(items))

    def get_folder(self, *, db: Session, user_id: str, folder_id: str) -> FragmentFolder:
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )
        return folder


class FragmentFolderCommandService:
    def create_folder(self, *, db: Session, user_id: str, name: str) -> FragmentFolder:
        normalized = normalize_folder_name(name)
        if fragment_folder_repository.get_by_name(db=db, user_id=user_id, name=normalized):
            raise ConflictError(message="文件夹名称已存在")
        try:
            return fragment_folder_repository.create(db=db, user_id=user_id, name=normalized)
        except IntegrityError as exc:
            db.rollback()
            raise ConflictError(message="文件夹名称已存在") from exc

    def rename_folder(self, *, db: Session, user_id: str, folder_id: str, name: str) -> FragmentFolder:
        folder = FragmentFolderQueryService().get_folder(db=db, user_id=user_id, folder_id=folder_id)
        normalized = normalize_folder_name(name)
        existing = fragment_folder_repository.get_by_name(db=db, user_id=user_id, name=normalized)
        if existing and existing.id != folder_id:
            raise ConflictError(message="文件夹名称已存在")
        try:
            return fragment_folder_repository.update_name(db=db, folder=folder, name=normalized)
        except IntegrityError as exc:
            db.rollback()
            raise ConflictError(message="文件夹名称已存在") from exc

    def delete_folder(self, *, db: Session, user_id: str, folder_id: str) -> None:
        folder = FragmentFolderQueryService().get_folder(db=db, user_id=user_id, folder_id=folder_id)
        folder_payloads = _FRAGMENT_SNAPSHOT_READER.list_raw_payloads(db=db, user_id=user_id)
        if any(str(item.get("folder_id") or "").strip() == folder_id for item in folder_payloads):
            raise ConflictError(message="文件夹内仍有碎片，无法删除")
        fragment_folder_repository.delete(db=db, folder=folder)
