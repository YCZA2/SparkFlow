"""add knowledge doc source and index metadata

Revision ID: b2c3d4e5f6a7
Revises: a2b3c4d5e6f7
Create Date: 2026-03-24 16:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为 knowledge_docs 增加来源、索引与处理错误元数据。"""
    op.add_column("knowledge_docs", sa.Column("source_type", sa.String(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("source_filename", sa.String(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("source_mime_type", sa.String(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("chunk_count", sa.Integer(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("processing_error", sa.Text(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    op.execute("UPDATE knowledge_docs SET source_type = 'manual' WHERE source_type IS NULL")
    op.execute("UPDATE knowledge_docs SET chunk_count = 0 WHERE chunk_count IS NULL")
    op.execute("UPDATE knowledge_docs SET updated_at = created_at WHERE updated_at IS NULL")

    op.alter_column("knowledge_docs", "source_type", existing_type=sa.String(), nullable=False)
    op.alter_column("knowledge_docs", "chunk_count", existing_type=sa.Integer(), nullable=False)
    op.alter_column("knowledge_docs", "updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    """回滚：删除知识库来源与索引元数据列。"""
    op.drop_column("knowledge_docs", "updated_at")
    op.drop_column("knowledge_docs", "processing_error")
    op.drop_column("knowledge_docs", "chunk_count")
    op.drop_column("knowledge_docs", "source_mime_type")
    op.drop_column("knowledge_docs", "source_filename")
    op.drop_column("knowledge_docs", "source_type")
