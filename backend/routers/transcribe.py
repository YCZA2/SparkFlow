"""
语音转写路由模块

提供音频上传和语音转写 API 端点
"""

import os
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.config import settings
from core.exceptions import ValidationError
from models import Fragment
from models.database import get_db

# 配置日志记录器
logger = logging.getLogger(__name__)

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


async def transcribe_with_retry(
    audio_path: str,
    fragment_id: str,
    user_id: str,
    max_retries: int = 2
) -> dict:
    """
    带重试机制的音频转写，转写成功后自动生成摘要和标签。

    Args:
        audio_path: 音频文件绝对路径
        fragment_id: 碎片记录 ID
        user_id: 用户 ID
        max_retries: 最大重试次数

    Returns:
        转写结果字典
    """
    from services.factory import get_stt_service
    from services.llm_service import generate_summary_and_tags
    from models.database import SessionLocal
    import json

    # 创建新的数据库会话（后台任务中不能使用原会话）
    db = SessionLocal()

    logger.info(f"[Transcribe] 开始转写任务: fragment_id={fragment_id}, audio_path={audio_path}")

    try:
        # 获取 STT 服务
        try:
            stt_service = get_stt_service()
            logger.info("[Transcribe] STT 服务创建成功")
        except Exception as e:
            logger.error(f"[Transcribe] STT 服务创建失败: {str(e)}")
            raise

        # 指数退避重试
        retries = 0
        last_error = None

        while retries <= max_retries:
            try:
                logger.info(f"[Transcribe] 第 {retries + 1} 次转写尝试...")
                # 调用 STT 服务转写
                result = await stt_service.transcribe(audio_path)

                logger.info(f"[Transcribe] 转写成功: {result.text[:50]}...")

                # 转写成功，生成摘要和标签
                transcript = result.text
                summary = None
                tags = None

                try:
                    logger.info("[Transcribe] 开始生成摘要和标签...")
                    summary, tags_list = await generate_summary_and_tags(transcript)
                    # 将标签列表转为 JSON 字符串存储
                    tags = json.dumps(tags_list, ensure_ascii=False)
                    logger.info(f"[Transcribe] 摘要: {summary}, 标签: {tags}")
                except Exception as e:
                    logger.warning(f"[Transcribe] 摘要/标签生成失败（不影响转写）: {str(e)}")
                    # 摘要/标签生成失败不影响转写结果

                # 更新碎片记录
                fragment = db.query(Fragment).filter(
                    Fragment.id == fragment_id,
                    Fragment.user_id == user_id
                ).first()

                if fragment:
                    fragment.transcript = transcript
                    fragment.summary = summary
                    fragment.tags = tags
                    fragment.sync_status = "synced"
                    db.commit()
                    logger.info(f"[Transcribe] 碎片记录已更新（含摘要和标签）: {fragment_id}")

                    return {
                        "success": True,
                        "transcript": transcript,
                        "summary": summary,
                        "tags": tags_list if tags else [],
                        "fragment_id": fragment_id,
                    }

            except Exception as e:
                last_error = str(e)
                logger.error(f"[Transcribe] 第 {retries + 1} 次转写失败: {last_error}")
                retries += 1

                if retries <= max_retries:
                    # 指数退避：1秒、3秒
                    wait_time = 2 ** retries - 1
                    logger.info(f"[Transcribe] 等待 {wait_time} 秒后重试...")
                    await asyncio.sleep(wait_time)

        # 重试全部失败，标记为失败状态
        logger.error(f"[Transcribe] 所有重试都失败，标记为 failed")
        fragment = db.query(Fragment).filter(
            Fragment.id == fragment_id,
            Fragment.user_id == user_id
        ).first()

        if fragment:
            fragment.sync_status = "failed"
            db.commit()

        return {
            "success": False,
            "error": f"转写失败（重试{max_retries}次）: {last_error}",
            "fragment_id": fragment_id,
        }

    except Exception as e:
        # 发生意外错误
        logger.error(f"[Transcribe] 转写过程异常: {str(e)}")
        fragment = db.query(Fragment).filter(
            Fragment.id == fragment_id,
            Fragment.user_id == user_id
        ).first()

        if fragment:
            fragment.sync_status = "failed"
            db.commit()

        return {
            "success": False,
            "error": f"转写过程异常: {str(e)}",
            "fragment_id": fragment_id,
        }

    finally:
        db.close()


# ========== API 端点 ==========


@router.post("/", status_code=status.HTTP_200_OK)
async def upload_audio(
    audio: UploadFile = File(..., description="音频文件 (.m4a, .wav, .mp3 等)"),
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    上传音频文件并触发自动转写

    接收音频文件上传，保存到服务器，创建碎片记录，
    并在后台自动触发语音转写流程。

    Args:
        audio: 音频文件（支持 .m4a, .wav, .mp3 等格式）

    Returns:
        包含音频文件路径和碎片 ID 的响应
        转写结果可通过 GET /api/transcribe/status/{fragment_id} 查询

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

    # 计算相对于上传根目录的路径: uploads/{user_id}/{filename}
    upload_root = Path(settings.UPLOAD_DIR)
    if not upload_root.is_absolute():
        upload_root = Path.cwd() / upload_root
    relative_path = file_path.relative_to(upload_root.parent)

    # 创建碎片记录（初始状态为 syncing）
    fragment = Fragment(
        user_id=user_id,
        audio_path=str(relative_path),
        source="voice",
        sync_status="syncing",  # 转写中状态
    )

    db.add(fragment)
    db.commit()
    db.refresh(fragment)

    # 在后台任务中执行转写（不阻塞响应）
    # 使用 asyncio.create_task 实现真正的异步处理
    asyncio.create_task(
        transcribe_with_retry(
            audio_path=str(file_path),
            fragment_id=fragment.id,
            user_id=user_id,
        )
    )

    return success_response(
        data={
            "audio_path": str(file_path),
            "relative_path": str(relative_path),
            "fragment_id": fragment.id,
            "file_size": len(content),
            "duration": None,  # TODO: 从音频元数据中提取时长
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
