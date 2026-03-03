"""
Abstract base class for Vector Database services.

This module defines the interface for vector database operations,
allowing easy switching between different providers (ChromaDB, Pinecone, Qdrant, etc.)
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class VectorQueryResult:
    """Result of a vector similarity query."""

    id: str
    text: str
    score: float
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class VectorDocument:
    """Document to be stored in vector database."""

    id: str
    text: str
    embedding: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None


class BaseVectorDBService(ABC):
    """
    Abstract base class for Vector Database service implementations.

    All vector database providers should implement this interface
    to ensure consistent behavior across different backends.

    The service uses a namespace-based isolation strategy where each user
    has their own collection/namespace for data privacy.
    """

    def __init__(self, **kwargs):
        """
        Initialize the vector database service.

        Args:
            **kwargs: Provider-specific configuration
        """
        self.config = kwargs

    @abstractmethod
    async def upsert(
        self,
        namespace: str,
        documents: List[VectorDocument],
        **kwargs
    ) -> bool:
        """
        Insert or update documents in the vector database.

        Args:
            namespace: The namespace/collection name (typically user_id based)
            documents: List of documents to upsert
            **kwargs: Additional provider-specific parameters

        Returns:
            True if operation succeeded

        Raises:
            VectorDBError: If the operation fails
        """
        pass

    @abstractmethod
    async def query(
        self,
        namespace: str,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[VectorQueryResult]:
        """
        Query similar vectors from the database.

        Args:
            namespace: The namespace/collection name
            query_embedding: The embedding vector to search for
            top_k: Number of results to return
            filter_metadata: Optional metadata filters
            **kwargs: Additional provider-specific parameters

        Returns:
            List of VectorQueryResult objects sorted by relevance (highest first)

        Raises:
            VectorDBError: If the query fails
        """
        pass

    @abstractmethod
    async def query_by_text(
        self,
        namespace: str,
        query_text: str,
        embedding_service: Any,  # BaseEmbeddingService instance
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[VectorQueryResult]:
        """
        Query similar vectors using text (auto-embeds the query text).

        Args:
            namespace: The namespace/collection name
            query_text: The text to search for
            embedding_service: The embedding service to use for query text
            top_k: Number of results to return
            filter_metadata: Optional metadata filters
            **kwargs: Additional provider-specific parameters

        Returns:
            List of VectorQueryResult objects sorted by relevance

        Raises:
            VectorDBError: If the query fails
        """
        pass

    @abstractmethod
    async def delete(
        self,
        namespace: str,
        document_ids: List[str],
        **kwargs
    ) -> bool:
        """
        Delete documents from the vector database.

        Args:
            namespace: The namespace/collection name
            document_ids: List of document IDs to delete
            **kwargs: Additional provider-specific parameters

        Returns:
            True if deletion succeeded

        Raises:
            VectorDBError: If the operation fails
        """
        pass

    @abstractmethod
    async def get_namespace_stats(
        self,
        namespace: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get statistics for a namespace.

        Args:
            namespace: The namespace/collection name
            **kwargs: Additional provider-specific parameters

        Returns:
            Dictionary containing statistics (document count, etc.)

        Raises:
            VectorDBError: If the operation fails
        """
        pass

    @abstractmethod
    async def namespace_exists(self, namespace: str) -> bool:
        """
        Check if a namespace exists.

        Args:
            namespace: The namespace/collection name

        Returns:
            True if the namespace exists
        """
        pass

    @abstractmethod
    async def create_namespace(
        self,
        namespace: str,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> bool:
        """
        Create a new namespace/collection.

        Args:
            namespace: The namespace/collection name
            metadata: Optional metadata for the namespace
            **kwargs: Additional provider-specific parameters

        Returns:
            True if creation succeeded

        Raises:
            VectorDBError: If the operation fails
        """
        pass

    @abstractmethod
    async def delete_namespace(self, namespace: str, **kwargs) -> bool:
        """
        Delete a namespace and all its documents.

        Args:
            namespace: The namespace/collection name
            **kwargs: Additional provider-specific parameters

        Returns:
            True if deletion succeeded

        Raises:
            VectorDBError: If the operation fails
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the vector database service is healthy and accessible.

        Returns:
            True if the service is healthy, False otherwise
        """
        pass


class VectorDBError(Exception):
    """Base exception for Vector Database service errors."""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "VECTOR_DB_ERROR"
        self.details = details or {}


class VectorDBNotFoundError(VectorDBError):
    """Raised when a namespace or document is not found."""

    def __init__(self, message: str = "Namespace or document not found"):
        super().__init__(message, code="NOT_FOUND_ERROR")


class VectorDBConnectionError(VectorDBError):
    """Raised when connection to vector database fails."""

    def __init__(self, message: str = "Failed to connect to vector database"):
        super().__init__(message, code="CONNECTION_ERROR")
