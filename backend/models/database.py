"""SQLAlchemy 数据库连接模块。"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from core import settings


def build_engine(database_url: str | None = None) -> Engine:
    """根据配置创建数据库引擎，并保留 SQLite 兼容分支。"""
    resolved_url = database_url or settings.DATABASE_URL
    engine_kwargs = {
        "echo": settings.DEBUG,
        "future": True,
    }
    if resolved_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        engine_kwargs["pool_pre_ping"] = True
    return create_engine(resolved_url, **engine_kwargs)


def create_session_factory(bind_engine: Engine) -> sessionmaker[Session]:
    """基于引擎创建统一的 Session 工厂。"""
    return sessionmaker(autocommit=False, autoflush=False, bind=bind_engine)


engine = build_engine()
SessionLocal = create_session_factory(engine)
Base = declarative_base()


def get_db():
    """提供路由层使用的数据库会话依赖。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(bind_engine: Engine | None = None) -> None:
    """初始化数据库表，仅用于本地或测试场景。"""
    Base.metadata.create_all(bind=bind_engine or engine)
