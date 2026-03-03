"""
Abstract base class for Embedding services.

This module defines the interface for text embedding services,
allowing easy switching between different providers.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class EmbeddingResult:
    """Result of an embedding operation."""

    embedding: List[float]
    model: Optional[str] = None
    dimensions: Optional[int] = None


class BaseEmbeddingService(ABC):
    """
    Abstract base class for Embedding service implementations.

    All embedding providers should implement this interface
    to ensure consistent behavior across different backends.
    """

    def __init__(self, model: Optional[str] = None, **kwargs):
        """
        Initialize the embedding service.

        Args:
            model: The model identifier to use (e.g., 'text-embedding-v2')
            **kwargs: Provider-specific configuration
        """
        self.model = model
        self.config = kwargs

    @abstractmethod
    async def embed(
        self,
        text: str,
        **kwargs
    ) -> EmbeddingResult:
        """
        Generate embedding for a single text.

        Args:
            text: The text to embed
            **kwargs: Additional provider-specific parameters

        Returns:
            EmbeddingResult containing the embedding vector

        Raises:
            EmbeddingError: If embedding generation fails
        """
        pass

    @abstractmethod
    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 10,
        **kwargs
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts to process in each batch
            **kwargs: Additional provider-specific parameters

        Returns:
            List of EmbeddingResult objects

        Raises:
            EmbeddingError: If embedding generation fails
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the embedding service is healthy and accessible.

        Returns:
            True if the service is healthy, False otherwise
        """
        pass

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """
        Get the dimensionality of the embeddings.

        Returns:
            Number of dimensions in the embedding vectors
        """
        pass


class EmbeddingError(Exception):
    """Base exception for Embedding service errors."""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "EMBEDDING_ERROR"
        self.details = details or {}


class EmbeddingRateLimitError(EmbeddingError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, code="RATE_LIMIT_ERROR")
