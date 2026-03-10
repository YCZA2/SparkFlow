from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.audio_ingestion import build_media_ingestion_pipeline_service
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import TranscriptionUseCase
from .schemas import AudioUploadResponse, TranscriptionStatusResponse

router = APIRouter(prefix="/api/transcriptions", tags=["transcriptions"], responses={401: {"description": "未认证"}})


def get_transcription_use_case(container: ServiceContainer = Depends(get_container)) -> TranscriptionUseCase:
    return TranscriptionUseCase(
        file_storage=container.file_storage,
        ingestion_service=build_media_ingestion_pipeline_service(container),
    )


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    response_model=ResponseModel[AudioUploadResponse],
    summary="上传音频并启动转写",
    description="上传音频文件后立即创建碎片记录，并在后台异步执行转写与摘要增强。",
)
async def upload_audio(
    audio: UploadFile = File(..., description="音频文件"),
    folder_id: str | None = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: TranscriptionUseCase = Depends(get_transcription_use_case),
):
    payload = await use_case.upload_audio(
        db=db,
        user_id=current_user["user_id"],
        audio=audio,
        folder_id=folder_id,
    )
    return success_response(data=payload, message="音频上传成功，已创建后台流水线")


@router.get(
    "/{fragment_id}",
    response_model=ResponseModel[TranscriptionStatusResponse],
    summary="获取转写状态",
    description="根据碎片 ID 查询当前转写状态，以及已生成的摘要、标签和分段信息。",
)
async def get_transcription_status(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: TranscriptionUseCase = Depends(get_transcription_use_case),
):
    return success_response(
        data=use_case.get_status(db=db, user_id=current_user["user_id"], fragment_id=fragment_id),
        message="转写状态获取成功",
    )
