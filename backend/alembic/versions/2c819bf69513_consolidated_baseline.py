"""consolidated baseline

Revision ID: 2c819bf69513
Revises:
Create Date: 2026-03-30

说明：当前开发阶段统一采用单一 baseline 管理 schema。
本迁移直接按当前 SQLAlchemy 模型创建完整表结构，适用于空库初始化；
若本地旧库曾经历历史迁移链或手工修补，请先清库后再执行 upgrade。
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
    """按当前模型定义一次性创建完整 schema。"""
    # 中文注释：仅加载 ORM 元数据，避免导入 models 聚合入口时触发业务层循环依赖。
    from models.database import Base
    from models import backup, fragment, media, pipeline, script, task, user, writing_context  # noqa: F401
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    """删除当前 baseline 创建的全部表。"""
    from models.database import Base
    from models import backup, fragment, media, pipeline, script, task, user, writing_context  # noqa: F401
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
