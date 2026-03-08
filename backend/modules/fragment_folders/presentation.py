from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import get_db_session

from .application import (
    FragmentFolderCommandService,
    FragmentFolderQueryService,
    map_fragment_folder,
)
from .schemas import FragmentFolderItem, FragmentFolderListResponse, FragmentFolderMutationRequest

router = APIRouter(prefix="/api/fragment-folders", tags=["fragment-folders"], responses={401: {"description": "未认证"}})


@router.get(
    "",
    response_model=ResponseModel[FragmentFolderListResponse],
    summary="获取碎片文件夹列表",
    description="返回当前用户的碎片文件夹及每个文件夹内的碎片数量。",
)
async def list_fragment_folders(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=FragmentFolderQueryService().list_folders(db=db, user_id=current_user["user_id"]))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ResponseModel[FragmentFolderItem],
    summary="创建碎片文件夹",
    description="创建一个新的碎片文件夹，同一用户下名称需唯一。",
)
async def create_fragment_folder(
    data: FragmentFolderMutationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    folder = FragmentFolderCommandService().create_folder(db=db, user_id=current_user["user_id"], name=data.name)
    return success_response(data=map_fragment_folder(folder), message="文件夹创建成功")


@router.patch(
    "/{folder_id}",
    response_model=ResponseModel[FragmentFolderItem],
    summary="重命名碎片文件夹",
    description="更新指定碎片文件夹的名称，同一用户下名称需唯一。",
)
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


@router.delete(
    "/{folder_id}",
    response_model=ResponseModel[None],
    summary="删除碎片文件夹",
    description="删除空文件夹；若文件夹内仍有碎片则会返回冲突错误。",
)
async def delete_fragment_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    FragmentFolderCommandService().delete_folder(db=db, user_id=current_user["user_id"], folder_id=folder_id)
    return success_response(data=None, message="文件夹删除成功")
