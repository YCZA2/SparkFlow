"""
ChromaDB Vector Database Service Implementation.

Local vector database with zero external dependencies.
Supports user-level namespace isolation.
"""

import os
from typing import List, Optional, Dict, Any

from .base import (
    BaseVectorDBService,
    VectorDocument,
    VectorQueryResult,
    VectorDBError,
    VectorDBNotFoundError,
    VectorDBConnectionError,
)


class ChromaVectorDBService(BaseVectorDBService):
    """
    Vector database service using ChromaDB (local).

    Features:
    - Zero external dependencies
    - User-level namespace isolation via collections
    - Persistent storage
    - Easy migration path to cloud services
    """

    def __init__(self, db_path: Optional[str] = None, **kwargs):
        """
        Initialize the ChromaDB service.

        Args:
            db_path: Path to store ChromaDB data (default: ./chroma_data)
            **kwargs: Additional configuration
        """
        super().__init__(**kwargs)

        self.db_path = db_path or os.getenv("CHROMADB_PATH", "./chroma_data")

        # Import chromadb
        try:
            import chromadb
            from chromadb.config import Settings
            self.chromadb = chromadb
            self.Settings = Settings
        except ImportError:
            raise VectorDBError(
                "chromadb package not installed. Run: pip install chromadb"
            )

        # Create client with persistent storage
        try:
            self.client = chromadb.PersistentClient(
                path=self.db_path,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=False,
                )
            )
        except Exception as e:
            raise VectorDBConnectionError(f"Failed to initialize ChromaDB: {str(e)}")

    async def upsert(
        self,
        namespace: str,
        documents: List[VectorDocument],
        **kwargs
    ) -> bool:
        """
        Insert or update documents in the vector database.

        Args:
            namespace: Collection name (typically user-based)
            documents: List of documents to upsert
            **kwargs: Additional parameters

        Returns:
            True if successful
        """
        if not documents:
            return True

        try:
            # Get or create collection
            collection = self.client.get_or_create_collection(
                name=namespace,
                metadata={"hnsw:space": "cosine"}
            )

            # Prepare data for ChromaDB
            ids = []
            texts = []
            embeddings = []
            metadatas = []

            for doc in documents:
                ids.append(doc.id)
                texts.append(doc.text)
                metadatas.append(doc.metadata or {})
                if doc.embedding:
                    embeddings.append(doc.embedding)

            # Upsert to ChromaDB
            if embeddings:
                # If embeddings are provided, use them directly
                collection.upsert(
                    ids=ids,
                    documents=texts,
                    embeddings=embeddings,
                    metadatas=metadatas
                )
            else:
                # Otherwise, ChromaDB will generate embeddings
                collection.upsert(
                    ids=ids,
                    documents=texts,
                    metadatas=metadatas
                )

            return True

        except Exception as e:
            raise VectorDBError(f"Failed to upsert documents: {str(e)}", code="UPSERT_ERROR")

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
            namespace: Collection name
            query_embedding: Query vector
            top_k: Number of results
            filter_metadata: Optional metadata filters
            **kwargs: Additional parameters

        Returns:
            List of VectorQueryResult objects
        """
        try:
            # Check if collection exists
            if not await self.namespace_exists(namespace):
                return []

            collection = self.client.get_collection(name=namespace)

            # Query
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=filter_metadata,
                include=["documents", "metadatas", "distances"]
            )

            # Convert to VectorQueryResult
            output = []
            if results and results["ids"]:
                for i, doc_id in enumerate(results["ids"][0]):
                    # Convert cosine distance to similarity score
                    # ChromaDB returns distance, where 0 is identical
                    distance = results["distances"][0][i] if results["distances"] else 0
                    score = 1 - distance  # Convert to similarity score

                    output.append(VectorQueryResult(
                        id=doc_id,
                        text=results["documents"][0][i] if results["documents"] else "",
                        score=score,
                        metadata=results["metadatas"][0][i] if results["metadatas"] else None
                    ))

            return output

        except Exception as e:
            raise VectorDBError(f"Failed to query: {str(e)}", code="QUERY_ERROR")

    async def query_by_text(
        self,
        namespace: str,
        query_text: str,
        embedding_service: Any,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[VectorQueryResult]:
        """
        Query using text (auto-embeds the query).

        Args:
            namespace: Collection name
            query_text: Query text
            embedding_service: Embedding service to use
            top_k: Number of results
            filter_metadata: Optional metadata filters
            **kwargs: Additional parameters

        Returns:
            List of VectorQueryResult objects
        """
        # Generate embedding for query text
        embedding_result = await embedding_service.embed(query_text)

        # Query using the embedding
        return await self.query(
            namespace=namespace,
            query_embedding=embedding_result.embedding,
            top_k=top_k,
            filter_metadata=filter_metadata,
            **kwargs
        )

    async def delete(
        self,
        namespace: str,
        document_ids: List[str],
        **kwargs
    ) -> bool:
        """
        Delete documents from the vector database.

        Args:
            namespace: Collection name
            document_ids: List of document IDs to delete
            **kwargs: Additional parameters

        Returns:
            True if successful
        """
        if not document_ids:
            return True

        try:
            if not await self.namespace_exists(namespace):
                return True

            collection = self.client.get_collection(name=namespace)
            collection.delete(ids=document_ids)

            return True

        except Exception as e:
            raise VectorDBError(f"Failed to delete documents: {str(e)}", code="DELETE_ERROR")

    async def get_namespace_stats(
        self,
        namespace: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get statistics for a namespace.

        Args:
            namespace: Collection name
            **kwargs: Additional parameters

        Returns:
            Dictionary with statistics
        """
        try:
            if not await self.namespace_exists(namespace):
                return {"exists": False, "count": 0}

            collection = self.client.get_collection(name=namespace)
            count = collection.count()

            return {
                "exists": True,
                "count": count,
                "namespace": namespace
            }

        except Exception as e:
            raise VectorDBError(f"Failed to get stats: {str(e)}", code="STATS_ERROR")

    async def namespace_exists(self, namespace: str) -> bool:
        """
        Check if a namespace exists.

        Args:
            namespace: Collection name

        Returns:
            True if the namespace exists
        """
        try:
            collections = self.client.list_collections()
            return namespace in [c.name for c in collections]
        except Exception:
            return False

    async def create_namespace(
        self,
        namespace: str,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> bool:
        """
        Create a new namespace/collection.

        Args:
            namespace: Collection name
            metadata: Optional metadata
            **kwargs: Additional parameters

        Returns:
            True if successful
        """
        try:
            if await self.namespace_exists(namespace):
                return True

            self.client.create_collection(
                name=namespace,
                metadata=metadata or {}
            )
            return True

        except Exception as e:
            raise VectorDBError(f"Failed to create namespace: {str(e)}", code="CREATE_ERROR")

    async def delete_namespace(self, namespace: str, **kwargs) -> bool:
        """
        Delete a namespace and all its documents.

        Args:
            namespace: Collection name
            **kwargs: Additional parameters

        Returns:
            True if successful
        """
        try:
            if not await self.namespace_exists(namespace):
                return True

            self.client.delete_collection(name=namespace)
            return True

        except Exception as e:
            raise VectorDBError(f"Failed to delete namespace: {str(e)}", code="DELETE_ERROR")

    async def health_check(self) -> bool:
        """
        Check if the vector database is healthy.

        Returns:
            True if healthy
        """
        try:
            # Try to list collections as a health check
            self.client.list_collections()
            return True
        except Exception:
            return False


# For backward compatibility, keep the old name
VectorService = ChromaVectorDBService
