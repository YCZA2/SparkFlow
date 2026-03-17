"""
用户与设备会话模型
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class User(Base):
    """
    用户表

    存储用户基本信息，支持 RBAC 角色权限控制（预留 creator 角色）
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    role = Column(String, default="user", nullable=False)  # 'user' | 'creator'
    nickname = Column(String, nullable=True)
    storage_quota = Column(Integer, default=1073741824)  # 预留：存储配额(字节)，默认1GB
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    fragments = relationship("Fragment", back_populates="user", cascade="all, delete-orphan")
    fragment_folders = relationship("FragmentFolder", back_populates="user", cascade="all, delete-orphan")
    fragment_tags = relationship("FragmentTag", back_populates="user", cascade="all, delete-orphan")
    scripts = relationship("Script", back_populates="user", cascade="all, delete-orphan")
    knowledge_docs = relationship("KnowledgeDoc", back_populates="user", cascade="all, delete-orphan")
    media_assets = relationship("MediaAsset", back_populates="user", cascade="all, delete-orphan")
    device_sessions = relationship("DeviceSession", back_populates="user", cascade="all, delete-orphan")
    backup_records = relationship("BackupRecord", back_populates="user", cascade="all, delete-orphan")
    restore_sessions = relationship("BackupRestoreSession", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, role={self.role}, nickname={self.nickname})>"


class DeviceSession(Base):
    """记录当前用户的活跃设备会话，用于单设备在线约束。"""

    __tablename__ = "device_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "device_id", name="uq_device_sessions_user_device"),
        Index("ix_device_sessions_user_id_status", "user_id", "status"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    device_id = Column(String, nullable=False)
    session_version = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="device_sessions")

    def __repr__(self) -> str:
        return (
            f"<DeviceSession(id={self.id}, user_id={self.user_id}, "
            f"device_id={self.device_id}, status={self.status})>"
        )
