"""merge latest heads

Revision ID: 5c1d2e3f4a5b
Revises: 3b5d7f9a1c2e, e7f8a9b0c1d2
Create Date: 2026-03-10 19:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "5c1d2e3f4a5b"
down_revision: Union[str, Sequence[str], None] = (
    "3b5d7f9a1c2e",
    "e7f8a9b0c1d2",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """合并最新两条迁移分支，保证启动脚本可按单 head 升级。"""
    return None


def downgrade() -> None:
    """回滚时拆分 merge 节点，恢复为两个独立 head。"""
    return None
