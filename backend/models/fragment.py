"""
碎片相关模型：文件夹、碎片、块、标签
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
    fragments = relationship("Fragment", back_populates="folder")

    def __repr__(self) -> str:
        return f"<FragmentFolder(id={self.id}, user_id={self.user_id}, name={self.name})>"


class Fragment(Base):
    """
    碎片笔记表

    存储用户的语音转写碎片，包含 AI 生成的摘要和标签
    """
    __tablename__ = "fragments"
    __table_args__ = (
        Index("ix_fragments_user_id_folder_id", "user_id", "folder_id"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    folder_id = Column(String, ForeignKey("fragment_folders.id"), nullable=True)
    audio_storage_provider = Column(String, nullable=True)  # local | oss
    audio_bucket = Column(String, nullable=True)
    audio_object_key = Column(String, nullable=True)
    audio_access_level = Column(String, nullable=True, default="private")
    audio_original_filename = Column(String, nullable=True)
    audio_mime_type = Column(String, nullable=True)
    audio_file_size = Column(Integer, nullable=True)
    audio_checksum = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)  # 转写文本
    speaker_segments = Column(Text, nullable=True)  # JSON数组字符串，说话人分段
    body_html = Column(Text, nullable=False, default="")  # HTML 正文
    plain_text_snapshot = Column(Text, nullable=False, default="")  # 由正文 HTML 派生的纯文本快照
    summary = Column(Text, nullable=True)  # AI一句话摘要
    tags = Column(String, nullable=True)  # JSON数组字符串，AI自动标签
    source = Column(String, default="voice", nullable=False)  # 'voice'|'manual'|'video_parse'
    audio_source = Column(String, nullable=True)  # 'upload'|'external_link'|None
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="fragments")
    folder = relationship("FragmentFolder", back_populates="fragments")
    fragment_tags = relationship("FragmentTag", back_populates="fragment", cascade="all, delete-orphan")
    blocks = relationship("FragmentBlock", back_populates="fragment", cascade="all, delete-orphan", order_by="FragmentBlock.order_index")

    def __repr__(self) -> str:
        return f"<Fragment(id={self.id}, user_id={self.user_id}, source={self.source})>"


class FragmentBlock(Base):
    """碎片块表，用于承载可扩展的 Markdown/图片/音频内容。"""

    __tablename__ = "fragment_blocks"
    __table_args__ = (
        UniqueConstraint("fragment_id", "order_index", name="uq_fragment_blocks_fragment_order"),
        Index("ix_fragment_blocks_fragment_id_order_index", "fragment_id", "order_index"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    block_type = Column(String, nullable=False)  # 当前仅支持 markdown
    order_index = Column(Integer, nullable=False, default=0)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    fragment = relationship("Fragment", back_populates="blocks")

    def __repr__(self) -> str:
        return f"<FragmentBlock(id={self.id}, fragment_id={self.fragment_id}, block_type={self.block_type})>"


class FragmentTag(Base):
    """碎片标签归一化表，为未来 Tag 搜索和聚合做准备。"""

    __tablename__ = "fragment_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "fragment_id", "tag", name="uq_fragment_tags_user_fragment_tag"),
        Index("ix_fragment_tags_user_id_tag", "user_id", "tag"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    tag = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="fragment_tags")
    fragment = relationship("Fragment", back_populates="fragment_tags")

    def __repr__(self) -> str:
        return f"<FragmentTag(id={self.id}, fragment_id={self.fragment_id}, tag={self.tag})>"
