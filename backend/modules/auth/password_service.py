"""
密码哈希与验证服务

使用 bcrypt 对用户密码进行单向哈希，与认证主流程解耦，便于未来替换算法。
"""

from passlib.context import CryptContext

# bcrypt 作为主算法，deprecated="auto" 允许未来平滑升级哈希方案
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """对明文密码进行 bcrypt 哈希，返回可直接持久化的哈希字符串。"""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码是否与存储的哈希匹配。"""
    return _pwd_context.verify(plain_password, hashed_password)
