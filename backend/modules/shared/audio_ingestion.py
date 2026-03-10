from __future__ import annotations

from .audio_ingestion_use_case import (
    PIPELINE_TYPE_MEDIA_INGESTION,
    AudioIngestionRequest,
    AudioIngestionResult,
    AudioIngestionUseCase,
    build_media_ingestion_pipeline_service,
)
from .media_ingestion_steps import DEFAULT_ENRICHMENT_TIMEOUT_SECONDS
from .stored_file_payloads import stored_file_from_payload, stored_file_to_payload

# 中文注释：保留旧常量名，确保测试和兼容导入仍能 patch 超时设置。
ENRICHMENT_TIMEOUT_SECONDS = DEFAULT_ENRICHMENT_TIMEOUT_SECONDS

# 中文注释：保留旧名字，避免现有导入点在本轮重构中全部改动。
AudioIngestionService = AudioIngestionUseCase
