"""
语音转写路由模块

提供音频上传和语音转写 API 端点
"""

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.config import settings
from core.exceptions import ValidationError
from models import Fragment
from models.database import get_db

# 创建路由
router = APIRouter(
    prefix="/api/transcribe",
    tags=["transcribe"],
    responses={401: {"description": "未认证"}},
)


# ========== Pydantic 响应模型 ==========


class UploadResponse(BaseModel):
    """音频上传响应模型"""
    audio_path: str = Field(..., description="音频文件保存路径")
    message: str = Field(..., description="状态消息")


# ========== 辅助函数 ==========


def ensure_upload_dir(user_id: str) -> Path:
    """
    确保用户上传目录存在

    Args:
        user_id: 用户ID

    Returns:
        用户上传目录的 Path 对象
    """
    # 上传根目录
    upload_root = Path(settings.UPLOAD_DIR).resolve()

    # 用户专属目录: uploads/{user_id}/
    user_dir = upload_root / user_id

    # 递归创建目录（如果不存在）
    user_dir.mkdir(parents=True, exist_ok=True)

    return user_dir


def get_file_extension(filename: str) -> str:
    """
    获取文件扩展名

    Args:
        filename: 原始文件名

    Returns:
        小写的扩展名（包含点号，如 .m4a）
    """
    ext = Path(filename).suffix.lower()
    # 如果扩展名是 .mp4 或没有扩展名，默认使用 .m4a
    if not ext or ext == ".mp4":
        return ".m4a"
    return ext


def validate_audio_file(content_type: Optional[str], filename: str) -> bool:
    """
    验证音频文件类型

    Args:
        content_type: MIME 类型
        filename: 文件名

    Returns:
        是否有效
    """
    # 允许的 MIME 类型
    allowed_types = {
        "audio/m4a",
        "audio/mp4",
        "audio/x-m4a",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/aac",
        "audio/ogg",
        "audio/opus",
        "application/octet-stream",  # iOS 有时上传时不指定具体类型
    }

    # 允许的扩展名
    allowed_extensions = {".m4a", ".wav", ".mp3", ".aac", ".ogg", ".opus"}

    # 检查扩展名
    ext = get_file_extension(filename)
    if ext in allowed_extensions:
        return True

    # 检查 MIME 类型
    if content_type and content_type.lower() in allowed_types:
        return True

    return False


# ========== API 端点 ==========


@router.post("/", status_code=status.HTTP_200_OK)
async def upload_audio(
    audio: UploadFile = File(..., description="音频文件 (.m4a, .wav, .mp3 等)"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    上传音频文件

    接收音频文件上传，保存到服务器，并创建碎片记录。
    此步骤仅上传文件，后续会触发自动转写流程。

    Args:
        audio: 音频文件（支持 .m4a, .wav, .mp3 等格式）

    Returns:
        包含音频文件路径的响应

    Raises:
        ValidationError: 文件类型无效或文件过大
    """
    user_id = current_user["user_id"]

    # 验证文件类型
    if not validate_audio_file(audio.content_type, audio.filename):
        raise ValidationError(
            message="不支持的音频文件格式",
            field_errors={
                "audio": f"支持的格式: .m4a, .wav, .mp3, .aac。当前: {audio.content_type or audio.filename}"
            },
        )

    # 验证文件大小（最大 50MB）
    max_size = 50 * 1024 * 1024  # 50MB in bytes
    content = await audio.read()
    if len(content) > max_size:
        raise ValidationError(
            message="音频文件过大",
            field_errors={"audio": "音频文件大小不能超过 50MB"},
        )

    # 获取文件扩展名
    ext = get_file_extension(audio.filename)

    # 生成唯一文件名: {uuid}.m4a
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"

    # 确保上传目录存在
    user_dir = ensure_upload_dir(user_id)

    # 完整文件路径
    file_path = user_dir / filename

    # 保存文件
    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise ValidationError(
            message="保存音频文件失败",
            field_errors={"audio": f"文件写入错误: {str(e)}"},
        )

    # 创建碎片记录（仅包含音频路径，等待转写）
    # 计算相对于上传根目录的路径: uploads/{user_id}/{filename}
    upload_root = Path(settings.UPLOAD_DIR)
    # 如果上传目录是绝对路径，使用它；否则基于当前工作目录
    if not upload_root.is_absolute():
        upload_root = Path.cwd() / upload_root
    relative_path = file_path.relative_to(upload_root.parent)

    fragment = Fragment(
        user_id=user_id,
        audio_path=str(relative_path),
        source="voice",
        sync_status="pending",  # 待转写状态
    )

    db.add(fragment)
    db.commit()
    db.refresh(fragment)

    return success_response(
        data={
            "audio_path": str(file_path),
            "relative_path": str(relative_path),
            "fragment_id": fragment.id,
            "file_size": len(content),
            "duration": None,  # TODO: 从音频元数据中提取时长
        },
        message="音频上传成功，等待转写",
    )


@router.get("/status/{fragment_id}")
async def get_transcribe_status(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取转写状态

    查询指定碎片笔记的转写状态

    Args:
        fragment_id: 碎片笔记 ID

    Returns:
        碎片笔记的转写状态和结果
    """
    fragment = (
        db.query(Fragment)
        .filter(
            Fragment.id == fragment_id,
            Fragment.user_id == current_user["user_id"],
        )
        .first()
    )

    if not fragment:
        from core.exceptions import NotFoundError

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
