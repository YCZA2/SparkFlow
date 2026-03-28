"""rename role creator to admin

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-03-27 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """将 users.role 中的 'creator' 值改为 'admin'。"""
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'creator'")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'creator' WHERE role = 'admin'")
