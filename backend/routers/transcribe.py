"""语音转写路由模块。"""

import asyncio

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.exceptions import NotFoundError
from models import Fragment
from models.database import get_db
from services import transcription_service

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
    fragment = (
        db.query(Fragment)
        .filter(Fragment.id == fragment_id, Fragment.user_id == current_user["user_id"])
        .first()
    )

    if not fragment:
        raise NotFoundError(
            message="碎片笔记不存在或无权访问",
            resource_type="fragment",
            resource_id=fragment_id,
        )

    return success_response(
        data={
            "fragment_id": fragment.id,
            "sync_status": fragment.sync_status,
            "transcript": fragment.transcript,
            "summary": fragment.summary,
            "tags": fragment.tags,
            "audio_path": fragment.audio_path,
            "created_at": fragment.created_at.isoformat() if fragment.created_at else None,
        },
        message="转写状态获取成功",
    )
