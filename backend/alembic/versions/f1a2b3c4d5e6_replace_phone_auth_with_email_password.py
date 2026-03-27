"""replace phone auth with email password

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-03-27 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """将手机号验证码认证替换为邮箱 + 密码认证。

    已有行的 email/password_hash 初始为 NULL，不影响迁移执行；
    旧用户需通过注册流程创建新账号。
    """
    # 删除手机验证码表
    op.drop_index("ix_phone_verification_codes_user_id_created_at", table_name="phone_verification_codes")
    op.drop_index("ix_phone_verification_codes_phone_number_created_at", table_name="phone_verification_codes")
    op.drop_table("phone_verification_codes")

    # 删除 users 表中的手机号相关字段
    op.drop_constraint("uq_users_phone_number", "users", type_="unique")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "phone_country_code")

    # 新增邮箱 + 密码哈希字段（nullable 兼容已有行）
    op.add_column("users", sa.Column("email", sa.String(), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.create_index("ix_users_email", "users", ["email"])


def downgrade() -> None:
    """回滚：恢复手机号字段，删除邮箱字段，重建验证码表。"""
    op.drop_index("ix_users_email", table_name="users")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")

    op.add_column("users", sa.Column("phone_country_code", sa.String(), nullable=False, server_default="+86"))
    op.add_column("users", sa.Column("phone_number", sa.String(), nullable=True))
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
    )
    op.create_index(
        "ix_phone_verification_codes_user_id_created_at",
        "phone_verification_codes",
        ["user_id", "created_at"],
    )
