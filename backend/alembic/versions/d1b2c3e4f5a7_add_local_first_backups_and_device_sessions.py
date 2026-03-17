"""add local-first backups and device sessions

Revision ID: d1b2c3e4f5a7
Revises: c090100cca09
Create Date: 2026-03-17 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d1b2c3e4f5a7"
down_revision = "c090100cca09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """新增设备会话与备份快照表，支撑 local-first 架构。"""
    op.create_table(
        "device_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_id", name="uq_device_sessions_user_device"),
    )
    op.create_index("ix_device_sessions_user_id_status", "device_sessions", ["user_id", "status"], unique=False)

    op.create_table(
        "backup_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("entity_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("operation", sa.String(), nullable=False, server_default="upsert"),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_backup_records_user_entity"),
    )
    op.create_index("ix_backup_records_user_id_updated_at", "backup_records", ["user_id", "updated_at"], unique=False)
    op.create_index("ix_backup_records_user_id_entity_type", "backup_records", ["user_id", "entity_type"], unique=False)

    op.create_table(
        "backup_restore_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("snapshot_generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_backup_restore_sessions_user_id_created_at",
        "backup_restore_sessions",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """回滚 local-first 备份与设备会话表。"""
    op.drop_index("ix_backup_restore_sessions_user_id_created_at", table_name="backup_restore_sessions")
    op.drop_table("backup_restore_sessions")
    op.drop_index("ix_backup_records_user_id_entity_type", table_name="backup_records")
    op.drop_index("ix_backup_records_user_id_updated_at", table_name="backup_records")
    op.drop_table("backup_records")
    op.drop_index("ix_device_sessions_user_id_status", table_name="device_sessions")
    op.drop_table("device_sessions")
