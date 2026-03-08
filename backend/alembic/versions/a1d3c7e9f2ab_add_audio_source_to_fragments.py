"""add audio_source to fragments

Revision ID: a1d3c7e9f2ab
Revises: 9f2a1a5b2b8c
Create Date: 2026-03-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1d3c7e9f2ab"
down_revision: Union[str, Sequence[str], None] = "9f2a1a5b2b8c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("fragments", sa.Column("audio_source", sa.String(), nullable=True))
    op.execute("UPDATE fragments SET audio_source = 'upload' WHERE source = 'voice' AND audio_path IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("fragments", "audio_source")
