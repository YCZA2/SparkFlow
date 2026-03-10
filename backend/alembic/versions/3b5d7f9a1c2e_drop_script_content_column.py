"""drop script content column

Revision ID: 3b5d7f9a1c2e
Revises: 2a4b6c8d0e1f
Create Date: 2026-03-10 18:55:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3b5d7f9a1c2e"
down_revision: Union[str, Sequence[str], None] = "2a4b6c8d0e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """删除 scripts 历史正文镜像列，只保留 body_markdown。"""
    op.drop_column("scripts", "content")


def downgrade() -> None:
    """回滚时恢复 scripts.content，并用 body_markdown 回填。"""
    op.add_column("scripts", sa.Column("content", sa.Text(), nullable=True))
    op.execute("UPDATE scripts SET content = body_markdown WHERE body_markdown IS NOT NULL")
