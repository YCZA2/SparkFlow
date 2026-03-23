"""add reference_script fields to knowledge_docs

Revision ID: a2b3c4d5e6f7
Revises: d1b2c3e4f5a7
Create Date: 2026-03-23 10:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "d1b2c3e4f5a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为 knowledge_docs 增加 style_description 和 processing_status 字段，支持 reference_script 类型。"""
    op.add_column("knowledge_docs", sa.Column("style_description", sa.Text(), nullable=True))
    op.add_column(
        "knowledge_docs",
        sa.Column("processing_status", sa.String(), nullable=True),
    )
    # 回填存量数据：现有文档均已就绪
    op.execute("UPDATE knowledge_docs SET processing_status = 'ready' WHERE processing_status IS NULL")
    op.alter_column("knowledge_docs", "processing_status", existing_type=sa.String(), nullable=False)


def downgrade() -> None:
    """回滚：删除 style_description 和 processing_status 列。"""
    op.drop_column("knowledge_docs", "processing_status")
    op.drop_column("knowledge_docs", "style_description")
