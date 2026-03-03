"""
数据库种子数据脚本

用于初始化默认测试用户数据
"""

import sys
from sqlalchemy.orm import Session

from models import SessionLocal, User


# 测试用户配置
TEST_USER_ID = "test-user-001"
TEST_USER_NICKNAME = "测试博主"
TEST_USER_ROLE = "user"


def create_test_user(db: Session) -> User:
    """
    创建测试用户（如果不存在）

    Args:
        db: 数据库会话

    Returns:
        User: 测试用户对象（新建或已存在）
    """
    # 检查是否已存在
    existing_user = db.query(User).filter(User.id == TEST_USER_ID).first()
    if existing_user:
        print(f"✓ 测试用户已存在: {TEST_USER_ID} ({existing_user.nickname})")
        return existing_user

    # 创建新用户
    test_user = User(
        id=TEST_USER_ID,
        nickname=TEST_USER_NICKNAME,
        role=TEST_USER_ROLE,
    )
    db.add(test_user)
    db.commit()
    db.refresh(test_user)

    print(f"✓ 测试用户创建成功: {TEST_USER_ID} ({TEST_USER_NICKNAME})")
    return test_user


def seed_all():
    """
    执行所有种子数据插入

    此函数创建数据库会话并调用各个种子函数
    """
    db = SessionLocal()
    try:
        print("=" * 50)
        print("开始执行数据库种子数据...")
        print("=" * 50)

        # 创建测试用户
        create_test_user(db)

        print("=" * 50)
        print("✓ 种子数据执行完成")
        print("=" * 50)

    except Exception as e:
        print(f"✗ 种子数据执行失败: {str(e)}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()
