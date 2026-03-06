"""
Services module for external API integrations.

This module provides:
- Base abstract interfaces for LLM, STT, Embedding, and Vector DB services
- Concrete implementations for Aliyun services
- Factory functions for creating service instances
- High-level business functions (summary, tags generation)

Usage:
    # Using factory functions (recommended)
    from services import get_llm_service, get_stt_service

    llm = get_llm_service()
    stt = get_stt_service()

    # Or create directly with custom config
    from services import create_llm_service
    llm = create_llm_service(provider="qwen", model="qwen-max")

    # Using business functions
    from services import generate_summary, generate_tags

    summary = await generate_summary(transcript)
    tags = await generate_tags(transcript)
"""

from .factory import (
    create_llm_service,
    create_stt_service,
    create_embedding_service,
    create_vector_db_service,
    get_llm_service,
    get_stt_service,
    get_embedding_service,
    get_vector_db_service,
    reset_services,
)

from .llm_service import (
    generate_summary,
    generate_tags,
    generate_summary_and_tags,
)
from .vector_service import build_fragment_namespace, upsert_fragment, query_similar_fragments

__all__ = [
    # Factory functions
    "create_llm_service",
    "create_stt_service",
    "create_embedding_service",
    "create_vector_db_service",
    "get_llm_service",
    "get_stt_service",
    "get_embedding_service",
    "get_vector_db_service",
    "reset_services",
    # Business functions
    "generate_summary",
    "generate_tags",
    "generate_summary_and_tags",
    "build_fragment_namespace",
    "upsert_fragment",
    "query_similar_fragments",
]
