"""consolidated baseline

Revision ID: 2c819bf69513
Revises:
Create Date: 2026-03-30

合并所有历史迁移为单一基线迁移
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2c819bf69513'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """创建所有表 - 从 SQLAlchemy 模型定义"""
    # 导入 Base 和所有模型
    from models import Base

    # 获取数据库连接
    bind = op.get_bind()

    # 使用 SQLAlchemy metadata 创建所有表
    Base.metadata.create_all(bind)


def downgrade() -> None:
    """删除所有表"""
    # 导入 Base
    from models import Base

    # 获取数据库连接
    bind = op.get_bind()

    # 删除所有表
    Base.metadata.drop_all(bind)