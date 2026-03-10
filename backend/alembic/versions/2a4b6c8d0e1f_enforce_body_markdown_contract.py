"""enforce body_markdown contract

Revision ID: 2a4b6c8d0e1f
Revises: 1f2e3d4c5b6a
Create Date: 2026-03-10 18:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2a4b6c8d0e1f"
down_revision: Union[str, Sequence[str], None] = "1f2e3d4c5b6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """回填正文并强制 scripts/knowledge 只以 body_markdown 为准。"""
    op.execute("UPDATE scripts SET body_markdown = content WHERE body_markdown IS NULL AND content IS NOT NULL")
    op.execute("UPDATE knowledge_docs SET body_markdown = content WHERE body_markdown IS NULL AND content IS NOT NULL")
    op.alter_column("scripts", "body_markdown", existing_type=sa.Text(), nullable=False)
    op.alter_column("knowledge_docs", "body_markdown", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    """回滚 body_markdown 非空约束。"""
    op.alter_column("knowledge_docs", "body_markdown", existing_type=sa.Text(), nullable=True)
    op.alter_column("scripts", "body_markdown", existing_type=sa.Text(), nullable=True)
