from __future__ import annotations

from fastapi import APIRouter, Depends

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.audio_ingestion import build_media_ingestion_pipeline_service
from modules.shared.container import ServiceContainer, get_container, get_db_session
from sqlalchemy.orm import Session

from .application import ExternalMediaUseCase
from .schemas import ExternalAudioImportRequest, ExternalAudioImportResponse

router = APIRouter(prefix="/api/external-media", tags=["external_media"], responses={401: {"description": "未认证"}})


def get_external_media_use_case(container: ServiceContainer = Depends(get_container)) -> ExternalMediaUseCase:
    return ExternalMediaUseCase(
        ingestion_service=build_media_ingestion_pipeline_service(container),
    )


@router.post(
    "/audio-imports",
    response_model=ResponseModel[ExternalAudioImportResponse],
    summary="导入外部媒体音频",
    description="接收外部媒体分享链接并创建后台导入任务，解析、下载、转写与增强均由 pipeline 异步完成。",
)
async def import_external_audio(
    data: ExternalAudioImportRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: ExternalMediaUseCase = Depends(get_external_media_use_case),
):
    payload = await use_case.import_audio(
        db=db,
        user_id=current_user["user_id"],
        share_url=data.share_url,
        platform=data.platform,
        folder_id=data.folder_id,
    )
    return success_response(data=payload, message="外部媒体音频导入任务已创建")
