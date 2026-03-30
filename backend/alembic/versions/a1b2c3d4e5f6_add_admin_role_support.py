"""add_admin_role_support

Revision ID: a1b2c3d4e5f6
Revises: 2c819bf69513
Create Date: 2026-03-30 00:00:00.000000

说明：users.role 列为纯 String 类型，无 DB 级 ENUM 约束，支持任意字符串值。
本迁移仅记录应用层新增 'admin' 角色的版本节点，无需 DDL 变更。
如需添加 DB 级 CHECK 约束，请在此处扩展 upgrade()。
"""

from alembic import op

# revision identifiers
revision = "a1b2c3d4e5f6"
down_revision = "2c819bf69513"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # role 列已支持任意字符串值，此迁移仅记录新增 'admin' 角色的应用层约束版本节点
    pass


def downgrade() -> None:
    pass
