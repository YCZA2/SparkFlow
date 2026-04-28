from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import ServiceContainer, get_container, get_db_session

from .application import BackupAssetUseCase, BackupUseCase
from .schemas import (
    BackupAssetAccessRequest,
    BackupAssetAccessResponse,
    BackupAssetUploadResponse,
    BackupBatchRequest,
    BackupBatchResponse,
    BackupRestoreRequest,
    BackupRestoreResponse,
    BackupSnapshotResponse,
)

router = APIRouter(prefix="/api/backups", tags=["backups"], responses={401: {"description": "未认证"}})


def get_backup_asset_use_case(container: ServiceContainer = Depends(get_container)) -> BackupAssetUseCase:
    return BackupAssetUseCase(file_storage=container.file_storage)


@router.post(
    "/batch",
    response_model=ResponseModel[BackupBatchResponse],
    summary="推送本地备份变更",
    description="按批次提交本地实体快照，服务端按最后写入赢策略落最新备份。",
)
async def push_backup_batch(
    data: BackupBatchRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    container: ServiceContainer = Depends(get_container),
):
    use_case = BackupUseCase(task_runner=container.task_runner)
    response = use_case.push_batch(
        db=db,
        user_id=current_user["user_id"],
        payload=data,
    )
    await use_case.enqueue_fragment_derivatives(
        user_id=current_user["user_id"],
        payload=data,
    )
    return success_response(
        data=response,
        message="备份批次写入成功",
    )


@router.get(
    "/snapshot",
    response_model=ResponseModel[BackupSnapshotResponse],
    summary="读取备份快照",
    description="返回当前用户的全量或增量备份快照。",
)
async def get_backup_snapshot(
    since_updated_at: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(
        data=BackupUseCase().get_snapshot(
            db=db,
            user_id=current_user["user_id"],
            since_updated_at=since_updated_at,
        ),
        message="备份快照获取成功",
    )


@router.post(
    "/restore",
    response_model=ResponseModel[BackupRestoreResponse],
    summary="创建恢复会话",
    description="记录一次显式恢复操作，并返回当前快照元信息。",
)
async def create_restore_session(
    data: BackupRestoreRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(
        data=BackupUseCase().create_restore_session(
            db=db,
            user_id=current_user["user_id"],
            device_id=current_user.get("device_id"),
            reason=data.reason,
        ),
        message="恢复会话已创建",
    )


@router.post(
    "/assets",
    response_model=ResponseModel[BackupAssetUploadResponse],
    summary="上传备份素材",
    description="上传图片、音频等大对象备份，并返回可嵌入实体快照的文件句柄。",
)
async def upload_backup_asset(
    file: UploadFile = File(..., description="待备份的大对象文件"),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
    use_case: BackupAssetUseCase = Depends(get_backup_asset_use_case),
):
    return success_response(
        data=BackupAssetUploadResponse.model_validate(
            await use_case.upload_asset(
                user_id=current_user["user_id"],
                file=file,
                entity_type=entity_type,
                entity_id=entity_id,
            )
        ),
        message="备份素材上传成功",
    )


@router.post(
    "/assets/access",
    response_model=ResponseModel[BackupAssetAccessResponse],
    summary="刷新备份素材访问地址",
    description="按 object_key 批量返回当前用户备份素材或关联音频的最新访问地址，用于恢复时重新获取签名 URL。",
)
async def refresh_backup_asset_access(
    data: BackupAssetAccessRequest,
    current_user: dict = Depends(get_current_user),
    use_case: BackupAssetUseCase = Depends(get_backup_asset_use_case),
):
    return success_response(
        data=use_case.resolve_asset_access(
            user_id=current_user["user_id"],
            payload=data,
        ),
        message="备份素材访问地址刷新成功",
    )
