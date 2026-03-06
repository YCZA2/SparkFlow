from typing import Optional

from pydantic import BaseModel, Field


class KnowledgeDocCreate(BaseModel):
    """创建知识库文档请求模型"""

    title: str = Field(..., description="文档标题")
    content: str = Field(..., description="文档内容")
    doc_type: str = Field(..., description="文档类型：high_likes 或 language_habit")

    class Config:
        json_schema_extra = {
            "example": {
                "title": "我的高赞文案合集",
                "content": "这是一段很长的文案内容...",
                "doc_type": "high_likes",
            }
        }


class KnowledgeDocItem(BaseModel):
    """知识库文档响应模型"""

    id: str
    title: str
    content: str
    doc_type: str
    vector_ref_id: Optional[str]
    created_at: str


class KnowledgeDocListResponse(BaseModel):
    """知识库文档列表响应模型"""

    items: list[KnowledgeDocItem]
    total: int
