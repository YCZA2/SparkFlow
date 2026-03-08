from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.audio_ingestion import AudioIngestionService
from modules.shared.container import FastApiBackgroundJobRunner, ServiceContainer, get_container, get_db_session
from sqlalchemy.orm import Session

from .application import ExternalMediaUseCase
from .schemas import ExternalAudioImportRequest, ExternalAudioImportResponse

router = APIRouter(prefix="/api/external-media", tags=["external_media"], responses={401: {"description": "未认证"}})


def get_external_media_use_case(container: ServiceContainer = Depends(get_container)) -> ExternalMediaUseCase:
    return ExternalMediaUseCase(
        external_media_provider=container.external_media_provider,
        imported_audio_storage=container.imported_audio_storage,
        ingestion_service=AudioIngestionService(
            stt_provider=container.stt_provider,
            llm_provider=container.llm_provider,
            vector_store=container.vector_store,
        ),
    )


@router.post(
    "/audio-imports",
    response_model=ResponseModel[ExternalAudioImportResponse],
    summary="导入外部媒体音频",
    description="接收外部媒体分享链接，下载并转换为 m4a 音频后保存到后端 uploads 目录。",
)
async def import_external_audio(
    background_tasks: BackgroundTasks,
    data: ExternalAudioImportRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    container: ServiceContainer = Depends(get_container),
    use_case: ExternalMediaUseCase = Depends(get_external_media_use_case),
):
    runner = FastApiBackgroundJobRunner(background_tasks)
    payload = await use_case.import_audio(
        db=db,
        user_id=current_user["user_id"],
        share_url=data.share_url,
        platform=data.platform,
        runner=runner,
        session_factory=container.session_factory,
    )
    return success_response(data=payload, message="外部媒体音频导入成功")
