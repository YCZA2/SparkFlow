from __future__ import annotations

from pydantic import BaseModel, Field


class MobileDebugLogCreateRequest(BaseModel):
    timestamp: str = Field(..., description="客户端日志时间戳")
    level: str = Field(..., description="日志级别")
    source: str = Field(..., description="日志来源")
    message: str = Field(..., description="日志摘要")
    context: dict | None = Field(default=None, description="附加上下文")


class MobileDebugLogItem(BaseModel):
    timestamp: str
    level: str
    source: str
    message: str
    context: dict | None = None
    user_id: str


class MobileDebugLogFileStatus(BaseModel):
    path: str
    appended: bool
