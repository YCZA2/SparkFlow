#!/usr/bin/env python3
"""
创建管理员用户的命令行工具

用于首次部署时创建初始 admin 账号，或忘记 admin 密码时创建新账号。

用法:
    cd /home/ycza/apps/sparkflow/backend
    source .venv/bin/activate
    python scripts/create_admin_user.py

交互式输入邮箱和密码，自动创建 admin 角色用户。
"""

import getpass
import re
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 添加 backend 到路径
sys.path.insert(0, '/home/ycza/apps/sparkflow/backend')

from core.config import settings
from core.exceptions import ValidationError
from domains.users import repository as user_repository
from models import User
from modules.admin_users.application import AdminUserCommandService
from modules.admin_users.schemas import UserCreateRequest


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_email(email: str) -> None:
    if not _EMAIL_PATTERN.match(email.strip().lower()):
        raise ValidationError("请输入有效的邮箱地址")


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValidationError("密码至少需要8位")


def main():
    print("=" * 50)
    print("SparkFlow 管理员账号创建工具")
    print("=" * 50)

    # 读取输入
    email = input("邮箱: ").strip()
    password = getpass.getpass("密码（至少8位）: ")
    confirm = getpass.getpass("确认密码: ")

    if password != confirm:
        print("错误: 两次输入的密码不一致")
        sys.exit(1)

    nickname = input("昵称（可选，回车跳过）: ").strip() or None

    # 校验
    try:
        validate_email(email)
        validate_password(password)
    except ValidationError as e:
        print(f"错误: {e.message}")
        sys.exit(1)

    # 创建数据库会话
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # 检查邮箱是否已存在
        existing = db.query(User).filter(User.email == email.lower()).first()
        if existing:
            print(f"错误: 邮箱 {email} 已被注册")
            sys.exit(1)

        # 创建 admin 用户
        service = AdminUserCommandService()
        payload = UserCreateRequest(
            email=email,
            password=password,
            nickname=nickname,
            role="admin",
        )
        user = service.create_user(db=db, payload=payload)

        print("\n" + "=" * 50)
        print("管理员账号创建成功!")
        print("=" * 50)
        print(f"邮箱: {email}")
        print(f"昵称: {user.nickname or '-'}")
        print(f"角色: admin")
        print("\n现在可以通过 /admin 登录管理后台了")

    except Exception as e:
        print(f"错误: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
