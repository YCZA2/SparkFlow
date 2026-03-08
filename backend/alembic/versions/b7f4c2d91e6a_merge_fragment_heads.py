"""merge fragment heads

Revision ID: b7f4c2d91e6a
Revises: 4c6f0d7ab123, a1d3c7e9f2ab
Create Date: 2026-03-08 16:20:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "b7f4c2d91e6a"
down_revision: Union[str, Sequence[str], None] = ("4c6f0d7ab123", "a1d3c7e9f2ab")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    return None


def downgrade() -> None:
    """Downgrade schema."""
    return None
