from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from modules.shared.content.content_schemas import MediaAssetItem

FragmentPurpose = Literal["content_material", "style_reference", "methodology", "case_study", "product_info", "other"]


class FragmentFolderInfo(BaseModel):
    id: str
    name: str


class SpeakerSegmentItem(BaseModel):
    speaker_id: str
    start_ms: int
    end_ms: int
    text: str


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
    system_purpose: FragmentPurpose | None = None
    user_purpose: FragmentPurpose | None = None
    effective_purpose: FragmentPurpose = "other"
    system_tags: list[str] | None = None
    user_tags: list[str] | None = None
    dismissed_system_tags: list[str] | None = None
    effective_tags: list[str] = Field(default_factory=list)
    source: str
    audio_source: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    audio_object_key: str | None = None
    audio_file_url: str | None = None
    audio_file_expires_at: str | None = None
    folder_id: str | None = None
    folder: FragmentFolderInfo | None = None
    body_html: str = ""
    plain_text_snapshot: str | None = None
    content_state: str = "empty"
    media_assets: list[MediaAssetItem] = Field(default_factory=list)


class SimilarFragmentItem(FragmentItem):
    score: float
    metadata: dict = Field(default_factory=dict)


class FragmentListResponse(BaseModel):
    items: list[FragmentItem]
    total: int
    limit: int
    offset: int


class SimilarFragmentListResponse(BaseModel):
    items: list[SimilarFragmentItem]
    total: int
    query_text: str


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
    effective_purpose: FragmentPurpose = "other"
    effective_tags: list[str] = Field(default_factory=list)
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


class FragmentAiEditRequest(BaseModel):
    body_html: str = Field(..., description="当前 HTML 正文")
    selection_text: str | None = Field(None, description="当前选中文本")
    instruction: Literal["polish", "shorten", "expand", "title", "script_seed"]


class FragmentAiPatch(BaseModel):
    op: Literal["replace_selection", "insert_after_selection", "prepend_document"]
    html_snippet: str = Field(..., description="可直接插入到正文中的 HTML 片段")


class FragmentAiEditResponse(BaseModel):
    patch: FragmentAiPatch
    preview_text: str
