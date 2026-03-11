from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from modules.shared.content_schemas import MediaAssetItem


class FragmentFolderInfo(BaseModel):
    id: str
    name: str


class SpeakerSegmentItem(BaseModel):
    speaker_id: str
    start_ms: int
    end_ms: int
    text: str


class EditorTextNode(BaseModel):
    text: str = ""
    marks: list[Literal["bold", "italic"]] = Field(default_factory=list)


class EditorBlock(BaseModel):
    id: str
    type: Literal["paragraph", "heading", "blockquote", "bullet_list", "ordered_list", "image"]
    children: list[EditorTextNode] = Field(default_factory=list)
    asset_id: str | None = None
    url: str | None = None
    width: int | None = None
    height: int | None = None
    alt: str | None = None


class EditorDocument(BaseModel):
    type: Literal["doc"] = "doc"
    blocks: list[EditorBlock] = Field(default_factory=list)


class FragmentCreateRequest(BaseModel):
    transcript: str | None = Field(None, description="转写文本")
    editor_document: EditorDocument | None = Field(None, description="富文本正文文档")
    source: str = Field("voice", description="来源：voice, manual, video_parse")
    audio_source: str | None = Field(None, description="音频来源：upload, external_link")
    folder_id: str | None = Field(None, description="文件夹 ID")
    media_asset_ids: list[str] = Field(default_factory=list, description="关联素材 ID 列表")


class FragmentUpdateRequest(BaseModel):
    folder_id: str | None = Field(None, description="文件夹 ID，传 null 表示移出文件夹")
    editor_document: EditorDocument | None = Field(None, description="完整富文本正文文档")
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
    editor_document: dict[str, Any] = Field(default_factory=lambda: {"type": "doc", "blocks": []})
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


class AiSelectionRange(BaseModel):
    start: int | None = None
    end: int | None = None


class FragmentAiEditRequest(BaseModel):
    editor_document: EditorDocument = Field(..., description="当前富文本正文文档")
    selection_text: str | None = Field(None, description="当前选中文本")
    selection_range: AiSelectionRange | None = Field(None, description="当前选区范围")
    target_block_id: str | None = Field(None, description="当前操作块 ID")
    instruction: Literal["polish", "shorten", "expand", "title", "script_seed"]


class FragmentAiPatch(BaseModel):
    op: Literal["replace_selection", "insert_after_selection", "prepend_heading"]
    target_block_id: str | None = None
    replacement_text: str | None = None
    block: dict[str, Any] | None = None
    blocks: list[dict[str, Any]] = Field(default_factory=list)


class FragmentAiEditResponse(BaseModel):
    patch: FragmentAiPatch
    preview_text: str
