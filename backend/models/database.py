"""SQLAlchemy 数据库连接模块。"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from core import settings


def build_engine(database_url: str | None = None, *, echo: bool | None = None) -> Engine:
    """根据配置创建 PostgreSQL 数据库引擎。

    Args:
        database_url: 数据库连接 URL，默认使用 settings.DATABASE_URL
        echo: 是否打印 SQL 语句，默认使用 settings.SQLALCHEMY_ECHO
    """
    resolved_url = database_url or settings.DATABASE_URL
    # SQL 日志开关统一走配置中心，避免直接读 os.environ 导致 .env 配置不生效
    should_echo = echo if echo is not None else settings.SQLALCHEMY_ECHO
    return create_engine(
        resolved_url,
        echo=should_echo,
        future=True,
        pool_pre_ping=True,
    )


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
