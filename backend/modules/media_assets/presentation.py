from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import MediaAssetUseCase
from .schemas import MediaAssetListResponse, MediaAssetUploadResponse

router = APIRouter(prefix="/api/media-assets", tags=["media_assets"], responses={401: {"description": "未认证"}})


def get_media_asset_use_case(container: ServiceContainer = Depends(get_container)) -> MediaAssetUseCase:
    """构建媒体资源用例。"""
    return MediaAssetUseCase(storage=container.file_storage)


@router.post(
    "",
    response_model=ResponseModel[MediaAssetUploadResponse],
    summary="上传媒体资源",
    description="上传图片、音频或通用文件，并生成可复用的媒体资源记录。",
)
async def upload_media_asset(
    file: UploadFile = File(..., description="媒体文件"),
    media_kind: str = Form(..., description="媒体类型：image / audio / file"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: MediaAssetUseCase = Depends(get_media_asset_use_case),
):
    payload = await use_case.upload(db=db, user_id=current_user["user_id"], file=file, media_kind=media_kind)
    return success_response(data=payload, message="媒体资源上传成功")


@router.get(
    "",
    response_model=ResponseModel[MediaAssetListResponse],
    summary="获取媒体资源列表",
    description="分页返回当前用户可复用的媒体资源。",
)
async def list_media_assets(
    media_kind: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: MediaAssetUseCase = Depends(get_media_asset_use_case),
):
    return success_response(
        data=use_case.list_assets(
            db=db,
            user_id=current_user["user_id"],
            media_kind=media_kind,
            limit=limit,
            offset=offset,
        )
    )


@router.delete(
    "/{asset_id}",
    response_model=ResponseModel[None],
    summary="删除媒体资源",
    description="删除媒体资源记录，并尝试清理对应本地文件和关联关系。",
)
async def delete_media_asset(
    asset_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: MediaAssetUseCase = Depends(get_media_asset_use_case),
):
    use_case.delete_asset(db=db, user_id=current_user["user_id"], asset_id=asset_id)
    return success_response(data=None, message="媒体资源删除成功")
