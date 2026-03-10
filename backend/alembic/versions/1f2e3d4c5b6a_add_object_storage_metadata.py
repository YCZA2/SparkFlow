"""add object storage metadata

Revision ID: 1f2e3d4c5b6a
Revises: f6a7b8c9d0e1
Create Date: 2026-03-10 13:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1f2e3d4c5b6a"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("fragments", sa.Column("audio_storage_provider", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_bucket", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_object_key", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_access_level", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_original_filename", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_mime_type", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_file_size", sa.Integer(), nullable=True))
    op.add_column("fragments", sa.Column("audio_checksum", sa.String(), nullable=True))

    op.add_column("media_assets", sa.Column("storage_provider", sa.String(), nullable=False, server_default="local"))
    op.add_column("media_assets", sa.Column("bucket", sa.String(), nullable=False, server_default="local"))
    op.add_column("media_assets", sa.Column("object_key", sa.String(), nullable=True))
    op.add_column("media_assets", sa.Column("access_level", sa.String(), nullable=False, server_default="private"))

    op.execute(
        """
        UPDATE fragments
        SET
            audio_storage_provider = CASE WHEN audio_path IS NOT NULL THEN 'local' ELSE NULL END,
            audio_bucket = CASE WHEN audio_path IS NOT NULL THEN 'local' ELSE NULL END,
            audio_object_key = REPLACE(audio_path, 'uploads/', ''),
            audio_access_level = CASE WHEN audio_path IS NOT NULL THEN 'private' ELSE NULL END,
            audio_original_filename = CASE
                WHEN audio_path IS NOT NULL THEN regexp_replace(audio_path, '^.*/', '')
                ELSE NULL
            END,
            audio_mime_type = CASE
                WHEN audio_path LIKE '%.m4a' THEN 'audio/m4a'
                WHEN audio_path LIKE '%.mp3' THEN 'audio/mpeg'
                WHEN audio_path LIKE '%.wav' THEN 'audio/wav'
                ELSE NULL
            END
        """
    )
    op.execute(
        """
        UPDATE media_assets
        SET
            storage_provider = 'local',
            bucket = 'local',
            object_key = REPLACE(storage_path, 'uploads/', ''),
            access_level = 'private'
        """
    )

    op.alter_column("media_assets", "object_key", nullable=False)
    op.drop_column("fragments", "audio_path")
    op.drop_column("media_assets", "storage_path")

    op.alter_column("media_assets", "storage_provider", server_default=None)
    op.alter_column("media_assets", "bucket", server_default=None)
    op.alter_column("media_assets", "access_level", server_default=None)


def downgrade() -> None:
    op.add_column("media_assets", sa.Column("storage_path", sa.String(), nullable=True))
    op.add_column("fragments", sa.Column("audio_path", sa.String(), nullable=True))

    op.execute(
        """
        UPDATE fragments
        SET audio_path = CASE
            WHEN audio_object_key IS NOT NULL THEN 'uploads/' || audio_object_key
            ELSE NULL
        END
        """
    )
    op.execute(
        """
        UPDATE media_assets
        SET storage_path = CASE
            WHEN object_key IS NOT NULL THEN 'uploads/' || object_key
            ELSE NULL
        END
        """
    )

    op.alter_column("fragments", "audio_path", nullable=True)
    op.alter_column("media_assets", "storage_path", nullable=False)

    op.drop_column("media_assets", "access_level")
    op.drop_column("media_assets", "object_key")
    op.drop_column("media_assets", "bucket")
    op.drop_column("media_assets", "storage_provider")

    op.drop_column("fragments", "audio_checksum")
    op.drop_column("fragments", "audio_file_size")
    op.drop_column("fragments", "audio_mime_type")
    op.drop_column("fragments", "audio_original_filename")
    op.drop_column("fragments", "audio_access_level")
    op.drop_column("fragments", "audio_object_key")
    op.drop_column("fragments", "audio_bucket")
    op.drop_column("fragments", "audio_storage_provider")
