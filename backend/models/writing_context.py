"""
脚本生成上下文聚合模型
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class StableCoreProfile(Base):
    """用户级稳定内核画像表。"""

    __tablename__ = "stable_core_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_stable_core_profiles_user_id"),
        Index("ix_stable_core_profiles_user_id_updated_at", "user_id", "updated_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False, default="")
    source_summary = Column(Text, nullable=True)
    source_signature = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="stable_core_profile")

    def __repr__(self) -> str:
        return f"<StableCoreProfile(id={self.id}, user_id={self.user_id})>"


class MethodologyEntry(Base):
    """用户级方法论条目表。"""

    __tablename__ = "methodology_entries"
    __table_args__ = (
        Index("ix_methodology_entries_user_id_enabled_updated_at", "user_id", "enabled", "updated_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    source_type = Column(String, nullable=False)  # fragment_distilled | knowledge_upload | preset
    source_ref_ids = Column(Text, nullable=True)  # JSON数组字符串，记录来源碎片或知识文档 ID
    source_signature = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="methodology_entries")

    def __repr__(self) -> str:
        return f"<MethodologyEntry(id={self.id}, user_id={self.user_id}, source_type={self.source_type})>"


class UserWritingStyle(Base):
    """用户写作风格描述表。"""

    __tablename__ = "user_writing_styles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_writing_styles_user_id"),
        Index("ix_user_writing_styles_user_id_updated_at", "user_id", "updated_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="writing_style")

    def __repr__(self) -> str:
        return f"<UserWritingStyle(id={self.id}, user_id={self.user_id})>"
