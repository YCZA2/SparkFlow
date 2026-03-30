"""
密码哈希与验证服务

使用 bcrypt 对用户密码进行单向哈希，与认证主流程解耦，便于未来替换算法。
"""

import bcrypt


def hash_password(plain_password: str) -> str:
    """对明文密码进行 bcrypt 哈希，返回可直接持久化的哈希字符串。"""
    # bcrypt 哈希需要字节输入，返回字节输出，需要编码/解码
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码是否与存储的哈希匹配。"""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False