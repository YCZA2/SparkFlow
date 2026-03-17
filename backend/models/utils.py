"""
模型层共享工具函数
"""

import uuid
from datetime import datetime, timezone


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """使用 timezone-aware UTC 时间，避免 utcnow 弃用告警。"""
    return datetime.now(timezone.utc)
