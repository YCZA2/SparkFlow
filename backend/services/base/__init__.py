"""
Base service interfaces for external API integrations.

This module defines abstract base classes for:
- LLM (Large Language Model) services
- STT (Speech-to-Text) services
- Vector Database services
- Embedding services

All implementations should inherit from these base classes.
"""

# LLM
from .base_llm import (
    BaseLLMService,
    LLMError,
    LLMRateLimitError,
    LLMAuthenticationError,
    LLMTimeoutError,
)

# STT
from .base_stt import (
    BaseSTTService,
    AudioFormat,
    SpeakerSegment,
    TranscriptionResult,
    STTError,
    STTFileError,
    STTRecognitionError,
    STTRateLimitError,
)

# Embedding
from .base_embedding import (
    BaseEmbeddingService,
    EmbeddingResult,
    EmbeddingError,
    EmbeddingRateLimitError,
)

# Vector DB
from .base_vector_db import (
    BaseVectorDBService,
    VectorDocument,
    VectorQueryResult,
    VectorDBError,
    VectorDBNotFoundError,
    VectorDBConnectionError,
)

__all__ = [
    # LLM
    "BaseLLMService",
    "LLMError",
    "LLMRateLimitError",
    "LLMAuthenticationError",
    "LLMTimeoutError",
    # STT
    "BaseSTTService",
    "AudioFormat",
    "SpeakerSegment",
    "TranscriptionResult",
    "STTError",
    "STTFileError",
    "STTRecognitionError",
    "STTRateLimitError",
    # Embedding
    "BaseEmbeddingService",
    "EmbeddingResult",
    "EmbeddingError",
    "EmbeddingRateLimitError",
    # Vector DB
    "BaseVectorDBService",
    "VectorDocument",
    "VectorQueryResult",
    "VectorDBError",
    "VectorDBNotFoundError",
    "VectorDBConnectionError",
]
