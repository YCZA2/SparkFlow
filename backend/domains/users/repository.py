"""用户数据访问层——管理员查询和操作所需的所有 DB 访问函数。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import DeviceSession, KnowledgeDoc, Script, User
from modules.shared.fragment_snapshots import FragmentSnapshotReader

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


# ---------------------------------------------------------------------------
# 内部辅助：统一过滤条件，供 list_users 和 count_users 复用
# ---------------------------------------------------------------------------

def _apply_user_filters(
    query,
    *,
    role: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
):
    """将常用过滤条件附加到用户查询，list 和 count 共用同一套逻辑。"""
    if role is not None:
        query = query.filter(User.role == role)
    if status is not None:
        query = query.filter(User.status == status)
    if search:
        like_expr = f"%{search}%"
        query = query.filter(
            User.email.ilike(like_expr) | User.nickname.ilike(like_expr)
        )
    if created_after is not None:
        query = query.filter(User.created_at >= created_after)
    if created_before is not None:
        query = query.filter(User.created_at <= created_before)
    return query


# ---------------------------------------------------------------------------
# 读取操作
# ---------------------------------------------------------------------------

def get_by_id(db: Session, *, user_id: str) -> Optional[User]:
    """按主键读取用户记录，不存在返回 None。"""
    return db.query(User).filter(User.id == user_id).first()


def list_users(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    role: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
) -> list[User]:
    """分页列出用户，支持按角色、状态、邮箱/昵称模糊搜索和注册时间区间过滤。"""
    query = db.query(User)
    query = _apply_user_filters(
        query,
        role=role,
        status=status,
        search=search,
        created_after=created_after,
        created_before=created_before,
    )
    return query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()


def count_users(
    db: Session,
    *,
    role: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
) -> int:
    """统计满足过滤条件的用户总数，与 list_users 参数对应。"""
    query = db.query(func.count(User.id))
    query = _apply_user_filters(
        query,
        role=role,
        status=status,
        search=search,
        created_after=created_after,
        created_before=created_before,
    )
    return query.scalar() or 0


# ---------------------------------------------------------------------------
# 写入操作
# ---------------------------------------------------------------------------

def update_user(
    db: Session,
    *,
    user: User,
    nickname: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    storage_quota: Optional[int] = None,
) -> User:
    """部分更新用户字段，仅更新传入的非 None 值，并提交事务。"""
    if nickname is not None:
        user.nickname = nickname
    if email is not None:
        user.email = email
    if role is not None:
        user.role = role
    if status is not None:
        user.status = status
    if storage_quota is not None:
        user.storage_quota = storage_quota
    db.commit()
    db.refresh(user)
    return user


def hard_delete_user(db: Session, *, user: User) -> None:
    """物理删除用户；依赖 ORM cascade='all, delete-orphan' 自动清理关联数据。"""
    db.delete(user)
    db.commit()


def soft_delete_user(db: Session, *, user: User) -> None:
    """软删除：将 status 置为 'deleted'，不移除数据库记录。"""
    user.status = "deleted"
    db.commit()


# ---------------------------------------------------------------------------
# 用户统计
# ---------------------------------------------------------------------------

def count_fragments_by_user(db: Session, *, user_id: str) -> int:
    """统计用户拥有的 fragment snapshot 数量。"""
    return len(_FRAGMENT_SNAPSHOT_READER.list_raw_payloads(db=db, user_id=user_id))


def count_scripts_by_user(db: Session, *, user_id: str) -> int:
    """统计用户拥有的成稿总数。"""
    return db.query(func.count(Script.id)).filter(Script.user_id == user_id).scalar() or 0


def count_knowledge_docs_by_user(db: Session, *, user_id: str) -> int:
    """统计用户上传的知识库文档总数。"""
    return db.query(func.count(KnowledgeDoc.id)).filter(KnowledgeDoc.user_id == user_id).scalar() or 0


def get_last_activity_at(db: Session, *, user_id: str) -> Optional[datetime]:
    """返回用户所有设备会话中最近一次的活跃时间，无会话时返回 None。"""
    result = (
        db.query(func.max(DeviceSession.last_seen_at))
        .filter(DeviceSession.user_id == user_id)
        .scalar()
    )
    return result


# ---------------------------------------------------------------------------
# 设备会话管理
# ---------------------------------------------------------------------------

def list_sessions_by_user(db: Session, *, user_id: str) -> list[DeviceSession]:
    """列出用户所有设备会话（含已撤销），按创建时间倒序。"""
    return (
        db.query(DeviceSession)
        .filter(DeviceSession.user_id == user_id)
        .order_by(DeviceSession.created_at.desc())
        .all()
    )


def revoke_all_sessions(db: Session, *, user_id: str, revoked_at: datetime) -> None:
    """撤销用户所有活跃设备会话，用于管理员强制登出。"""
    db.query(DeviceSession).filter(
        DeviceSession.user_id == user_id,
        DeviceSession.status == "active",
    ).update({"status": "revoked", "revoked_at": revoked_at})
    db.commit()


# ---------------------------------------------------------------------------
# 系统级统计
# ---------------------------------------------------------------------------

def count_total_users(db: Session) -> int:
    """返回数据库中用户总数（含已删除）。"""
    return db.query(func.count(User.id)).scalar() or 0


def count_active_users(db: Session) -> int:
    """返回状态为 active 的用户数量。"""
    return db.query(func.count(User.id)).filter(User.status == "active").scalar() or 0


def count_new_users_today(db: Session, *, today_start: datetime) -> int:
    """返回今日（UTC 起始时间之后）注册的新用户数量。"""
    return (
        db.query(func.count(User.id))
        .filter(User.created_at >= today_start)
        .scalar()
        or 0
    )
