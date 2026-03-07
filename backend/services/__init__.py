"""
Services module for external API integrations.

This module provides:
- Base abstract interfaces for LLM, STT, Embedding, and Vector DB services
- Concrete provider implementations
- Factory functions for creating service instances

Usage:
    # Using factory functions
    from services import get_llm_service, get_stt_service

    llm = get_llm_service()
    stt = get_stt_service()

    # Or create directly with custom config
    from services import create_llm_service
    llm = create_llm_service(provider="qwen", model="qwen-max")
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
]
