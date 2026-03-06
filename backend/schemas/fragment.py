from typing import Optional

from pydantic import BaseModel, Field


class FragmentCreate(BaseModel):
    """创建碎片笔记请求模型"""

    transcript: Optional[str] = Field(None, description="转写文本")
    source: str = Field("voice", description="来源：voice, manual, video_parse")
    audio_path: Optional[str] = Field(None, description="音频文件路径")

    class Config:
        json_schema_extra = {
            "example": {
                "transcript": "今天想到了一个关于定位的好点子",
                "source": "voice",
            }
        }


class FragmentItem(BaseModel):
    """碎片笔记响应模型"""

    id: str
    transcript: Optional[str]
    summary: Optional[str]
    tags: Optional[list[str]]
    source: str
    sync_status: str
    created_at: str
    audio_path: Optional[str] = None


class FragmentDetail(FragmentItem):
    """碎片笔记详情响应模型"""

    audio_path: Optional[str]


class FragmentListResponse(BaseModel):
    """碎片列表响应模型"""

    items: list[FragmentItem]
    total: int
    limit: int
    offset: int


class FragmentSimilarityQuery(BaseModel):
    """碎片语义查询请求模型"""

    query_text: str = Field(..., description="查询文本")
    top_k: int = Field(5, ge=1, le=20, description="返回结果数量")
    exclude_ids: list[str] = Field(default_factory=list, description="需要排除的碎片 ID")


class SimilarFragmentItem(FragmentItem):
    """相似碎片响应模型"""

    score: float
    metadata: dict = Field(default_factory=dict)
