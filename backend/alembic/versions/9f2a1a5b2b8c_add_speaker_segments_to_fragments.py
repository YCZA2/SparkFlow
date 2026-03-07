"""add speaker_segments to fragments

Revision ID: 9f2a1a5b2b8c
Revises: e6b527a83de7
Create Date: 2026-03-07 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f2a1a5b2b8c"
down_revision: Union[str, Sequence[str], None] = "e6b527a83de7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("fragments", sa.Column("speaker_segments", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("fragments", "speaker_segments")
