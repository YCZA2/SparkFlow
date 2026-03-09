from __future__ import annotations

from pydantic import BaseModel, Field


class FragmentFolderInfo(BaseModel):
    id: str
    name: str


class SpeakerSegmentItem(BaseModel):
    speaker_id: str
    start_ms: int
    end_ms: int
    text: str


class FragmentCreateRequest(BaseModel):
    transcript: str | None = Field(None, description="转写文本")
    source: str = Field("voice", description="来源：voice, manual, video_parse")
    audio_source: str | None = Field(None, description="音频来源：upload, external_link")
    audio_path: str | None = Field(None, description="音频路径")
    folder_id: str | None = Field(None, description="文件夹 ID")


class FragmentFolderUpdateRequest(BaseModel):
    folder_id: str | None = Field(..., description="文件夹 ID，传 null 表示移出文件夹")


class FragmentBatchMoveRequest(BaseModel):
    fragment_ids: list[str] = Field(..., min_length=1, max_length=100)
    folder_id: str | None = Field(..., description="目标文件夹 ID，传 null 表示移出文件夹")


class SimilarityQueryRequest(BaseModel):
    query_text: str = Field(..., description="查询文本")
    top_k: int = Field(5, ge=1, le=20, description="返回结果数量")
    exclude_ids: list[str] = Field(default_factory=list, description="需要排除的碎片 ID")


class FragmentItem(BaseModel):
    id: str
    transcript: str | None = None
    speaker_segments: list[SpeakerSegmentItem] | None = None
    summary: str | None = None
    tags: list[str] | None = None
    source: str
    audio_source: str | None = None
    created_at: str | None = None
    audio_path: str | None = None
    folder_id: str | None = None
    folder: FragmentFolderInfo | None = None


class FragmentListResponse(BaseModel):
    items: list[FragmentItem]
    total: int
    limit: int
    offset: int


class SimilarFragmentItem(FragmentItem):
    score: float
    metadata: dict = Field(default_factory=dict)


class SimilarFragmentListResponse(BaseModel):
    items: list[SimilarFragmentItem]
    total: int
    query_text: str


class FragmentBatchMoveResponse(BaseModel):
    items: list[FragmentItem]
    moved_count: int


class FragmentTagItem(BaseModel):
    tag: str
    fragment_count: int


class FragmentTagListResponse(BaseModel):
    items: list[FragmentTagItem]
    total: int
    query_text: str | None = None


class FragmentVisualizationPoint(BaseModel):
    id: str
    x: float
    y: float
    z: float
    transcript: str | None = None
    summary: str | None = None
    tags: list[str] | None = None
    source: str
    created_at: str | None = None
    cluster_id: int | None = None
    is_noise: bool = False


class FragmentVisualizationCentroid(BaseModel):
    x: float
    y: float
    z: float


class FragmentVisualizationCluster(BaseModel):
    id: int
    label: str
    keywords: list[str] = Field(default_factory=list)
    fragment_count: int
    centroid: FragmentVisualizationCentroid


class FragmentVisualizationStats(BaseModel):
    total_fragments: int
    clustered_fragments: int
    uncategorized_fragments: int


class FragmentVisualizationMeta(BaseModel):
    projection: str
    clustering: str
    used_vector_source: str


class FragmentVisualizationResponse(BaseModel):
    points: list[FragmentVisualizationPoint] = Field(default_factory=list)
    clusters: list[FragmentVisualizationCluster] = Field(default_factory=list)
    stats: FragmentVisualizationStats
    meta: FragmentVisualizationMeta
