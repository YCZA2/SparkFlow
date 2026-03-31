"""碎片相关模型：当前仅保留文件夹表。"""

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class FragmentFolder(Base):
    """用户自定义碎片文件夹。"""

    __tablename__ = "fragment_folders"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_fragment_folders_user_name"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="fragment_folders")

    def __repr__(self) -> str:
        return f"<FragmentFolder(id={self.id}, user_id={self.user_id}, name={self.name})>"
