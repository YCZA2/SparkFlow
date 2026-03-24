"""
口播稿模型
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class Script(Base):
    """
    口播稿表

    存储 AI 生成的口播稿内容，当前统一使用主题生成与每日推盘两类语义
    """
    __tablename__ = "scripts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    body_html = Column(Text, nullable=False)  # HTML 正文
    mode = Column(String, nullable=False)  # 'mode_rag'（主题 + SOP + few-shot）| 'mode_daily_push'（每日推盘）
    source_fragment_ids = Column(String, nullable=True)  # JSON数组字符串，关联碎片ID
    status = Column(String, default="draft", nullable=False)  # 'draft'|'ready'|'filmed'
    is_daily_push = Column(Boolean, default=False, nullable=False)  # 是否每日自动生成
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="scripts")

    def __repr__(self) -> str:
        return f"<Script(id={self.id}, user_id={self.user_id}, mode={self.mode}, status={self.status})>"
