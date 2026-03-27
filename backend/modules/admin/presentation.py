"""
用户管理后台 API
仅限 creator 角色访问，提供用户列表、新建、编辑、重置密码、删除功能。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.exceptions import AuthenticationError, ValidationError
from models import (
    User,
    DeviceSession,
    Fragment,
    FragmentFolder,
    FragmentTag,
    Script,
    BackupRecord,
    BackupRestoreSession,
    MediaAsset,
    ContentMediaLink,
    KnowledgeDoc,
    PipelineRun,
    PipelineStepRun,
    StableCoreProfile,
    MethodologyEntry,
)
from modules.auth.password_service import hash_password
from modules.shared.infrastructure.container import get_db_session

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_creator(current_user: dict = Depends(get_current_user)) -> dict:
    """仅允许 creator 角色调用管理接口。"""
    if current_user.get("role") != "creator":
        raise AuthenticationError("需要管理员权限")
    return current_user


@router.get(
    "/check-creator",
    summary="检查是否已有管理员",
    description="公开接口，用于注册页面判断是否允许注册 creator 账号。",
)
async def check_creator(db: Session = Depends(get_db_session)):
    """检查系统中是否存在 creator 角色的用户。"""
    count = db.query(User).filter(User.role == "creator").count()
    return success_response(data={"has_creator": count > 0})


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="密码至少 8 位")
    nickname: str | None = None
    role: str = Field("user", description="'user' 或 'creator'")


class UserUpdateRequest(BaseModel):
    nickname: str | None = None
    role: str | None = Field(None, description="'user' 或 'creator'")
    status: str | None = Field(None, description="'active' 或 'inactive'")


class ResetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=8, description="新密码至少 8 位")


def _serialize_user(u: User) -> dict:
    """把 User ORM 对象序列化为 API 响应字典。"""
    return {
        "user_id": u.id,
        "email": u.email,
        "nickname": u.nickname,
        "role": u.role,
        "status": u.status,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


@router.get("/users", summary="获取用户列表")
async def list_users(
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_creator),
):
    """返回所有用户，按注册时间倒序。"""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return success_response(data=[_serialize_user(u) for u in users])


@router.post("/users", summary="创建用户")
async def create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_creator),
):
    """由管理员直接创建新用户，不需要设备会话。"""
    if payload.role not in ("user", "creator"):
        raise ValidationError("角色值无效", {"role": "invalid"})
    normalized_email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise ValidationError("该邮箱已被注册", {"email": "already_exists"})
    user = User(
        role=payload.role,
        nickname=payload.nickname or f"用户{normalized_email.split('@')[0][:8]}",
        email=normalized_email,
        password_hash=hash_password(payload.password),
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return success_response(data=_serialize_user(user), message="用户创建成功")


@router.patch("/users/{user_id}", summary="编辑用户")
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_creator),
):
    """更新用户的昵称、角色或状态，仅修改传入的字段。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValidationError("用户不存在", {"user_id": "not_found"})
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.role is not None:
        if payload.role not in ("user", "creator"):
            raise ValidationError("角色值无效", {"role": "invalid"})
        user.role = payload.role
    if payload.status is not None:
        if payload.status not in ("active", "inactive"):
            raise ValidationError("状态值无效", {"status": "invalid"})
        user.status = payload.status
    db.commit()
    return success_response(data=_serialize_user(user), message="更新成功")


@router.post("/users/{user_id}/reset-password", summary="重置密码")
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
    _: dict = Depends(require_creator),
):
    """为指定用户设置新密码，下次登录生效。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValidationError("用户不存在", {"user_id": "not_found"})
    user.password_hash = hash_password(payload.password)
    db.commit()
    return success_response(data=None, message="密码已重置")


@router.delete("/users/{user_id}", summary="删除用户")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db_session),
    current_user: dict = Depends(require_creator),
):
    """永久删除用户及其关联数据，不可撤销；不允许删除自己。"""
    if user_id == current_user["user_id"]:
        raise ValidationError("不能删除当前登录账号", {"user_id": "self_delete"})
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValidationError("用户不存在", {"user_id": "not_found"})

    # 删除所有关联数据（按依赖顺序）
    # 1. 流水线步骤（必须先删除，因为有外键依赖 pipeline_runs）
    db.query(PipelineStepRun).filter(
        PipelineStepRun.pipeline_run_id.in_(
            db.query(PipelineRun.id).filter(PipelineRun.user_id == user_id)
        )
    ).delete(synchronize_session=False)

    # 2. 流水线运行
    db.query(PipelineRun).filter(PipelineRun.user_id == user_id).delete()

    # 3. 碎片相关数据（Fragment 有 cascade，会自动删除 blocks）
    # 先删除文件夹，因为 Fragment 有 folder_id 外键
    db.query(FragmentFolder).filter(FragmentFolder.user_id == user_id).delete()
    # 删除碎片，cascade 会自动删除 FragmentBlock
    db.query(Fragment).filter(Fragment.user_id == user_id).delete()
    # FragmentTag 有 user_id 外键，单独清理可能的孤儿记录
    db.query(FragmentTag).filter(FragmentTag.user_id == user_id).delete()

    # 3. 成稿
    db.query(Script).filter(Script.user_id == user_id).delete()

    # 4. 媒体与知识库
    db.query(ContentMediaLink).filter(ContentMediaLink.user_id == user_id).delete()
    db.query(KnowledgeDoc).filter(KnowledgeDoc.user_id == user_id).delete()
    db.query(MediaAsset).filter(MediaAsset.user_id == user_id).delete()

    # 5. 备份相关
    db.query(BackupRestoreSession).filter(BackupRestoreSession.user_id == user_id).delete()
    db.query(BackupRecord).filter(BackupRecord.user_id == user_id).delete()

    # 6. 设备会话
    db.query(DeviceSession).filter(DeviceSession.user_id == user_id).delete()

    # 7. 写作上下文
    db.query(MethodologyEntry).filter(MethodologyEntry.user_id == user_id).delete()
    db.query(StableCoreProfile).filter(StableCoreProfile.user_id == user_id).delete()

    # 最后删除用户本身
    db.delete(user)
    db.commit()
    return success_response(data=None, message="用户已删除")
