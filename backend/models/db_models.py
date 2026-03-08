"""
SQLAlchemy 数据模型定义

定义所有数据库表结构，对应 architecture.md 中的 Schema 设计
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from models.database import Base


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """使用 timezone-aware UTC 时间，避免 utcnow 弃用告警。"""
    return datetime.now(timezone.utc)


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
    agents = relationship("Agent", back_populates="creator", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, role={self.role}, nickname={self.nickname})>"


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
    audio_path = Column(String, nullable=True)  # uploads/{user_id}/{uuid}.m4a
    transcript = Column(Text, nullable=True)  # 转写文本
    speaker_segments = Column(Text, nullable=True)  # JSON数组字符串，说话人分段
    summary = Column(Text, nullable=True)  # AI一句话摘要
    tags = Column(String, nullable=True)  # JSON数组字符串，AI自动标签
    source = Column(String, default="voice", nullable=False)  # 'voice'|'manual'|'video_parse'
    audio_source = Column(String, nullable=True)  # 'upload'|'external_link'|None
    sync_status = Column(String, default="pending", nullable=False)  # 'pending'|'syncing'|'synced'|'failed'
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="fragments")
    folder = relationship("FragmentFolder", back_populates="fragments")
    fragment_tags = relationship("FragmentTag", back_populates="fragment", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Fragment(id={self.id}, user_id={self.user_id}, source={self.source})>"


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


class Script(Base):
    """
    口播稿表

    存储 AI 生成的口播稿内容，支持两种生成模式
    """
    __tablename__ = "scripts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=True)  # 成稿内容
    mode = Column(String, nullable=False)  # 'mode_a' | 'mode_b'
    source_fragment_ids = Column(String, nullable=True)  # JSON数组字符串，关联碎片ID
    status = Column(String, default="draft", nullable=False)  # 'draft'|'ready'|'filmed'
    is_daily_push = Column(Boolean, default=False, nullable=False)  # 是否每日自动生成
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="scripts")

    def __repr__(self) -> str:
        return f"<Script(id={self.id}, user_id={self.user_id}, mode={self.mode}, status={self.status})>"


class KnowledgeDoc(Base):
    """
    知识库文档表

    存储用户上传的高赞文案或语言习惯文档，用于 Mode B 风格模仿
    """
    __tablename__ = "knowledge_docs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    doc_type = Column(String, nullable=False)  # 'high_likes'|'language_habit'
    vector_ref_id = Column(String, nullable=True)  # 向量库中的引用ID，格式：docs_{user_id}:{doc_id}
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="knowledge_docs")

    def __repr__(self) -> str:
        return f"<KnowledgeDoc(id={self.id}, user_id={self.user_id}, title={self.title})>"


class Agent(Base):
    """
    Agent 预留表

    为未来创作者市场功能预留，支持发布和订阅 Agent 模型
    """
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=generate_uuid)
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="private", nullable=False)  # 'private'|'pending'|'published'
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    creator = relationship("User", back_populates="agents")

    def __repr__(self) -> str:
        return f"<Agent(id={self.id}, creator_id={self.creator_id}, name={self.name}, status={self.status})>"
