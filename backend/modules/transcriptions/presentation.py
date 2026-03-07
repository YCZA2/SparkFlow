from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from modules.shared.container import FastApiBackgroundJobRunner, ServiceContainer, get_container, get_db_session

from .application import TranscriptionUseCase

router = APIRouter(prefix="/api/transcriptions", tags=["transcriptions"], responses={401: {"description": "未认证"}})


def get_transcription_use_case(container: ServiceContainer = Depends(get_container)) -> TranscriptionUseCase:
    return TranscriptionUseCase(
        audio_storage=container.audio_storage,
        stt_provider=container.stt_provider,
        llm_provider=container.llm_provider,
        vector_store=container.vector_store,
    )


@router.post("", status_code=status.HTTP_200_OK)
async def upload_audio(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(..., description="音频文件"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    container: ServiceContainer = Depends(get_container),
    use_case: TranscriptionUseCase = Depends(get_transcription_use_case),
):
    runner = FastApiBackgroundJobRunner(background_tasks)
    payload = await use_case.upload_audio(
        db=db,
        user_id=current_user["user_id"],
        audio=audio,
    )
    runner.schedule(
        use_case.process_transcription,
        fragment_id=payload["fragment_id"],
        user_id=current_user["user_id"],
        audio_path=payload["audio_path"],
        session_factory=container.session_factory,
    )
    return success_response(data=payload, message="音频上传成功，正在转写中")


@router.get("/{fragment_id}")
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
