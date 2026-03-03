"""
Qwen (Tongyi Qianwen) Embedding Service Implementation.

Uses Alibaba Cloud's DashScope SDK to generate text embeddings.
"""

import os
from typing import List, Optional

from .base import BaseEmbeddingService, EmbeddingResult, EmbeddingError, EmbeddingRateLimitError


class QwenEmbeddingService(BaseEmbeddingService):
    """
    Embedding service implementation using Alibaba Cloud's Tongyi Qianwen.

    Supports models: text-embedding-v2 (1536 dimensions)
    """

    # Default model
    DEFAULT_MODEL = "text-embedding-v2"

    # Model dimensions mapping
    MODEL_DIMENSIONS = {
        "text-embedding-v2": 1536,
        "text-embedding-v1": 1536,
    }

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, **kwargs):
        """
        Initialize the Qwen embedding service.

        Args:
            model: The embedding model to use (default: text-embedding-v2)
            api_key: DashScope API key
            **kwargs: Additional configuration
        """
        super().__init__(model=model or self.DEFAULT_MODEL, **kwargs)
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")

        if not self.api_key:
            raise EmbeddingError(
                "DashScope API key not found. Please set DASHSCOPE_API_KEY environment variable."
            )

        # Import dashscope here to avoid dependency issues
        try:
            import dashscope
            self.dashscope = dashscope
            dashscope.api_key = self.api_key
        except ImportError:
            raise EmbeddingError(
                "dashscope package not installed. Run: pip install dashscope"
            )

    async def embed(self, text: str, **kwargs) -> EmbeddingResult:
        """
        Generate embedding for a single text.

        Args:
            text: The text to embed
            **kwargs: Additional parameters

        Returns:
            EmbeddingResult containing the embedding vector
        """
        if not text or not text.strip():
            raise EmbeddingError("Text cannot be empty")

        try:
            resp = self.dashscope.TextEmbedding.call(
                model=self.model,
                input=text,
                **kwargs
            )

            if resp.status_code != 200:
                error_code = resp.code if hasattr(resp, 'code') else "UNKNOWN"
                error_message = resp.message if hasattr(resp, 'message') else "Unknown error"

                if error_code == "Throttling.RateQuota":
                    raise EmbeddingRateLimitError(f"Rate limit exceeded: {error_message}")
                else:
                    raise EmbeddingError(f"API error: {error_message}", code=error_code)

            # Extract embedding from response
            if resp.output and resp.output.get('embeddings'):
                embedding_data = resp.output['embeddings'][0]['embedding']
                return EmbeddingResult(
                    embedding=embedding_data,
                    model=self.model,
                    dimensions=len(embedding_data)
                )
            else:
                raise EmbeddingError("Empty embedding response", code="EMPTY_RESPONSE")

        except (EmbeddingError,):
            raise
        except Exception as e:
            raise EmbeddingError(f"Failed to generate embedding: {str(e)}", code="EMBEDDING_ERROR")

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
            batch_size: Number of texts per batch (Qwen supports up to 25 per call)
            **kwargs: Additional parameters

        Returns:
            List of EmbeddingResult objects
        """
        if not texts:
            return []

        results = []

        # Process in batches (Qwen supports up to 25 texts per call)
        effective_batch_size = min(batch_size, 25)

        for i in range(0, len(texts), effective_batch_size):
            batch = texts[i:i + effective_batch_size]

            try:
                # Filter out empty texts
                valid_batch = [t for t in batch if t and t.strip()]
                if not valid_batch:
                    results.extend([None] * len(batch))
                    continue

                resp = self.dashscope.TextEmbedding.call(
                    model=self.model,
                    input=valid_batch,
                    **kwargs
                )

                if resp.status_code != 200:
                    error_code = resp.code if hasattr(resp, 'code') else "UNKNOWN"
                    error_message = resp.message if hasattr(resp, 'message') else "Unknown error"
                    raise EmbeddingError(f"Batch API error: {error_message}", code=error_code)

                if resp.output and resp.output.get('embeddings'):
                    batch_results = []
                    for emb_data in resp.output['embeddings']:
                        embedding = emb_data['embedding']
                        batch_results.append(EmbeddingResult(
                            embedding=embedding,
                            model=self.model,
                            dimensions=len(embedding)
                        ))
                    results.extend(batch_results)
                else:
                    raise EmbeddingError("Empty batch embedding response", code="EMPTY_RESPONSE")

            except Exception as e:
                # If batch fails, try individual calls as fallback
                for text in batch:
                    try:
                        result = await self.embed(text)
                        results.append(result)
                    except Exception:
                        results.append(None)

        return results

    async def health_check(self) -> bool:
        """
        Check if the embedding service is healthy.

        Returns:
            True if healthy
        """
        try:
            await self.embed("Hello world")
            return True
        except Exception:
            return False

    @property
    def dimensions(self) -> int:
        """
        Get the dimensionality of the embeddings.

        Returns:
            Number of dimensions (1536 for text-embedding-v2)
        """
        return self.MODEL_DIMENSIONS.get(self.model, 1536)
