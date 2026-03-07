from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from modules.shared.container import get_db_session

from .application import (
    FragmentFolderCommandService,
    FragmentFolderQueryService,
    map_fragment_folder,
)

router = APIRouter(prefix="/api/fragment-folders", tags=["fragment-folders"], responses={401: {"description": "未认证"}})


class FragmentFolderMutationRequest(BaseModel):
    name: str


@router.get("")
async def list_fragment_folders(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=FragmentFolderQueryService().list_folders(db=db, user_id=current_user["user_id"]))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_fragment_folder(
    data: FragmentFolderMutationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    folder = FragmentFolderCommandService().create_folder(db=db, user_id=current_user["user_id"], name=data.name)
    return success_response(data=map_fragment_folder(folder), message="文件夹创建成功")


@router.patch("/{folder_id}")
async def rename_fragment_folder(
    folder_id: str,
    data: FragmentFolderMutationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    folder = FragmentFolderCommandService().rename_folder(
        db=db,
        user_id=current_user["user_id"],
        folder_id=folder_id,
        name=data.name,
    )
    return success_response(data=map_fragment_folder(folder), message="文件夹更新成功")


@router.delete("/{folder_id}")
async def delete_fragment_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    FragmentFolderCommandService().delete_folder(db=db, user_id=current_user["user_id"], folder_id=folder_id)
    return success_response(data=None, message="文件夹删除成功")
