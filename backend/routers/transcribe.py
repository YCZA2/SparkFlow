"""语音转写路由模块。"""

import asyncio

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from core import success_response
from core.exceptions import ServiceUnavailableError
from core.auth import get_current_user
from models.database import get_db
from services import fragment_service, transcription_service
from services.factory import get_stt_service

router = APIRouter(
    prefix="/api/transcribe",
    tags=["transcribe"],
    responses={401: {"description": "未认证"}},
)


@router.post("/", status_code=status.HTTP_200_OK)
async def upload_audio(
    audio: UploadFile = File(..., description="音频文件 (.m4a, .wav, .mp3 等)"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传音频并异步触发转写流程。"""
    user_id = current_user["user_id"]

    try:
        # 预检 STT 服务，避免在明显不可用时仍然创建一条必然失败的碎片记录。
        get_stt_service()
    except Exception as exc:
        raise ServiceUnavailableError(
            message=f"语音转写服务暂时不可用: {str(exc)}",
            service_name="stt",
        ) from exc

    saved = await transcription_service.save_uploaded_audio(audio=audio, user_id=user_id)
    fragment = transcription_service.create_fragment_for_transcription(
        db=db,
        user_id=user_id,
        relative_path=saved["relative_path"],
    )

    asyncio.create_task(
        transcription_service.transcribe_with_retry(
            audio_path=saved["file_path"],
            fragment_id=fragment.id,
            user_id=user_id,
        )
    )

    return success_response(
        data={
            "audio_path": saved["file_path"],
            "relative_path": saved["relative_path"],
            "fragment_id": fragment.id,
            "file_size": saved["file_size"],
            "duration": None,
            "sync_status": "syncing",
        },
        message="音频上传成功，正在转写中",
    )


@router.get("/status/{fragment_id}")
async def get_transcribe_status(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询指定碎片的转写状态。"""
    fragment = fragment_service.get_fragment_or_raise(
        db=db,
        user_id=current_user["user_id"],
        fragment_id=fragment_id,
    )

    return success_response(
        data=fragment_service.serialize_transcribe_status(fragment),
        message="转写状态获取成功",
    )
