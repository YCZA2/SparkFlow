from typing import Optional

from pydantic import BaseModel, Field


class ScriptGenerateRequest(BaseModel):
    """口播稿生成请求模型"""

    fragment_ids: list[str] = Field(..., description="选中的碎片 ID 列表", min_length=1, max_length=20)
    mode: str = Field(..., description="生成模式：mode_a (导师爆款) 或 mode_b (专属二脑)")

    class Config:
        json_schema_extra = {
            "example": {
                "fragment_ids": ["fragment-uuid-1", "fragment-uuid-2", "fragment-uuid-3"],
                "mode": "mode_a",
            }
        }


class ScriptItem(BaseModel):
    """口播稿列表项响应模型"""

    id: str
    title: Optional[str]
    mode: str
    source_fragment_count: int = 0
    status: str
    is_daily_push: bool
    created_at: str


class ScriptDetail(ScriptItem):
    """口播稿详情响应模型"""

    content: Optional[str]
    source_fragment_ids: Optional[list[str]]


class ScriptUpdateRequest(BaseModel):
    """口播稿更新请求模型"""

    status: Optional[str] = Field(None, description="更新状态: draft, ready, filmed")
    title: Optional[str] = Field(None, description="更新标题")

    class Config:
        json_schema_extra = {"example": {"status": "filmed", "title": "我的定位方法论"}}
