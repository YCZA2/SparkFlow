"""add phone auth fields

Revision ID: e1f2a3b4c5d6
Revises: d9e8f7a6b5c4
Create Date: 2026-03-25 14:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d9e8f7a6b5c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为正式手机号验证码登录补齐用户字段和验证码表。"""
    op.add_column("users", sa.Column("phone_country_code", sa.String(), nullable=False, server_default="+86"))
    op.add_column("users", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("users", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_users_phone_number", "users", ["phone_number"])

    op.create_table(
        "phone_verification_codes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("phone_country_code", sa.String(), nullable=False, server_default="+86"),
        sa.Column("phone_number", sa.String(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("send_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_phone_verification_codes_phone_number_created_at",
        "phone_verification_codes",
        ["phone_number", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_phone_verification_codes_user_id_created_at",
        "phone_verification_codes",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """回滚手机号认证所需的用户字段和验证码表。"""
    op.drop_index("ix_phone_verification_codes_user_id_created_at", table_name="phone_verification_codes")
    op.drop_index("ix_phone_verification_codes_phone_number_created_at", table_name="phone_verification_codes")
    op.drop_table("phone_verification_codes")
    op.drop_constraint("uq_users_phone_number", "users", type_="unique")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "status")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "phone_country_code")
