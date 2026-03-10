from __future__ import annotations

from pydantic import BaseModel, Field

from modules.shared.content_schemas import FragmentBlockInput, FragmentBlockItem, MediaAssetItem


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
    capture_text: str | None = Field(None, description="原始采集文本")
    body_markdown: str | None = Field(None, description="Markdown 正文")
    source: str = Field("voice", description="来源：voice, manual, video_parse")
    audio_source: str | None = Field(None, description="音频来源：upload, external_link")
    folder_id: str | None = Field(None, description="文件夹 ID")
    media_asset_ids: list[str] = Field(default_factory=list, description="关联素材 ID 列表")


class FragmentUpdateRequest(BaseModel):
    folder_id: str | None = Field(None, description="文件夹 ID，传 null 表示移出文件夹")
    body_markdown: str | None = Field(None, description="保存 Markdown 正文时使用")
    blocks: list[FragmentBlockInput] | None = Field(None, description="完整碎片块列表，当前仅支持 markdown")
    media_asset_ids: list[str] | None = Field(None, description="要绑定到碎片的素材 ID 列表")


class FragmentBatchMoveRequest(BaseModel):
    fragment_ids: list[str] = Field(..., min_length=1, max_length=100)
    folder_id: str | None = Field(..., description="目标文件夹 ID，传 null 表示移出文件夹")


class SimilarityQueryRequest(BaseModel):
    query_text: str = Field(..., description="查询文本")
    top_k: int = Field(5, ge=1, le=20, description="返回结果数量")
    exclude_ids: list[str] = Field(default_factory=list, description="需要排除的碎片 ID")


class FragmentItem(BaseModel):
    id: str
    capture_text: str | None = None
    transcript: str | None = None
    speaker_segments: list[SpeakerSegmentItem] | None = None
    summary: str | None = None
    tags: list[str] | None = None
    source: str
    audio_source: str | None = None
    created_at: str | None = None
    audio_file_url: str | None = None
    audio_file_expires_at: str | None = None
    folder_id: str | None = None
    folder: FragmentFolderInfo | None = None
    blocks: list[FragmentBlockItem] = Field(default_factory=list)
    compiled_markdown: str | None = None
    content_state: str = "empty"
    media_assets: list[MediaAssetItem] = Field(default_factory=list)


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
