from logging.config import fileConfig
import sys
import os

# 将 backend 目录添加到路径，以便导入模型
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import text

from alembic import context
from alembic.script import ScriptDirectory

from core.config import settings
from models.database import Base
from models import backup, fragment, media, script, task, user, writing_context  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 设置目标元数据以支持 autogenerate
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def bootstrap_single_baseline(connection) -> bool:
    """在空库下为单一 baseline 显式建表并写入版本号。"""
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    if len(heads) != 1:
        return False

    head_revision = script.get_revision(heads[0])
    if head_revision is None or head_revision.down_revision is not None:
        return False

    version_table_exists = connection.execute(text("SELECT to_regclass('alembic_version')")).scalar_one()
    if version_table_exists is not None:
        version_rows = connection.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar_one()
        if version_rows > 0:
            return False
    else:
        connection.execute(
            text(
                """
                CREATE TABLE alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
                )
                """
            )
        )

    # 中文注释：单 baseline 场景直接按 metadata 建全表，再写入当前 revision，
    # 这样空库初始化不依赖 Alembic 额外推断版本表状态。
    Base.metadata.create_all(connection)
    connection.execute(
        text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
        {"revision": head_revision.revision},
    )
    connection.commit()
    return True


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # 中文注释：显式固定到 public，避免空库或本机数据库自定义 search_path 时找不到默认 schema。
        connection.execute(text("SET search_path TO public"))
        connection.commit()
        if bootstrap_single_baseline(connection):
            return
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
