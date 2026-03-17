"""
备份与恢复模型（local-first 备份基础设施）
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class BackupRecord(Base):
    """记录用户本地实体在远端的最新备份快照。"""

    __tablename__ = "backup_records"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_backup_records_user_entity"),
        Index("ix_backup_records_user_id_updated_at", "user_id", "updated_at"),
        Index("ix_backup_records_user_id_entity_type", "user_id", "entity_type"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    entity_version = Column(Integer, nullable=False, default=1)
    operation = Column(String, nullable=False, default="upsert")
    payload_json = Column(Text, nullable=True)
    modified_at = Column(DateTime(timezone=True), nullable=True)
    last_modified_device_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="backup_records")

    def __repr__(self) -> str:
        return (
            f"<BackupRecord(id={self.id}, user_id={self.user_id}, entity_type={self.entity_type}, "
            f"entity_id={self.entity_id}, entity_version={self.entity_version})>"
        )


class BackupRestoreSession(Base):
    """记录一次用户主动触发的恢复会话。"""

    __tablename__ = "backup_restore_sessions"
    __table_args__ = (
        Index("ix_backup_restore_sessions_user_id_created_at", "user_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    device_id = Column(String, nullable=True)
    reason = Column(String, nullable=True)
    snapshot_generated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="restore_sessions")

    def __repr__(self) -> str:
        return (
            f"<BackupRestoreSession(id={self.id}, user_id={self.user_id}, "
            f"device_id={self.device_id})>"
        )
