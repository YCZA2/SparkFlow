"""drop fragment capture_text

Revision ID: 6a7b8c9d0e1f
Revises: 5c1d2e3f4a5b
Create Date: 2026-03-10 21:05:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "6a7b8c9d0e1f"
down_revision: Union[str, Sequence[str], None] = "5c1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """移除已废弃的碎片采集文本字段。"""
    op.execute("UPDATE fragments SET transcript = NULL WHERE source <> 'voice'")
    op.drop_column("fragments", "capture_text")


def downgrade() -> None:
    """回滚时恢复 capture_text 列，兼容旧版数据结构。"""
    op.add_column("fragments", sa.Column("capture_text", sa.Text(), nullable=True))
