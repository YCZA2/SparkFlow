"""
Service Factory - Creates service instances based on configuration.

This module provides factory functions to create LLM, STT, Embedding,
and Vector DB services based on environment variables.

Usage:
    llm_service = create_llm_service()
    stt_service = create_stt_service()
    embedding_service = create_embedding_service()
    vector_db_service = create_vector_db_service()
"""

import os
from typing import Optional

from .base import BaseLLMService, BaseSTTService, BaseEmbeddingService, BaseVectorDBService


def create_llm_service(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    **kwargs
) -> BaseLLMService:
    """
    Create an LLM service instance based on provider.

    Args:
        provider: LLM provider ('qwen', 'wenxin', 'zhipu', 'openai')
                 Defaults to LLM_PROVIDER env var or 'qwen'
        model: Model name (e.g., 'qwen-turbo', 'qwen-max')
               Defaults to LLM_MODEL env var
        **kwargs: Additional provider-specific options

    Returns:
        An instance of BaseLLMService

    Raises:
        ValueError: If the provider is not supported
    """
    provider = (provider or os.getenv("LLM_PROVIDER", "qwen")).lower()
    model = model or os.getenv("LLM_MODEL")

    if provider == "qwen":
        from .qwen_llm import QwenLLMService
        return QwenLLMService(model=model, **kwargs)
    elif provider in ["wenxin", "baidu"]:
        # Future: Implement Baidu Wenxin
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'qwen' or implement the provider."
        )
    elif provider == "zhipu":
        # Future: Implement Zhipu AI
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'qwen' or implement the provider."
        )
    elif provider == "openai":
        # Future: Implement OpenAI
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'qwen' or implement the provider."
        )
    else:
        raise ValueError(
            f"Unknown LLM provider: '{provider}'. "
            "Supported providers: qwen, wenxin, zhipu, openai"
        )


def create_stt_service(
    provider: Optional[str] = None,
    **kwargs
) -> BaseSTTService:
    """
    Create an STT service instance based on provider.

    Args:
        provider: STT provider ('dashscope', 'aliyun', 'xunfei', 'baidu')
                 Defaults to STT_PROVIDER env var or 'dashscope'
                 'dashscope': 阿里云百炼/灵积平台 (推荐，仅需一个 API Key)
                 'aliyun': 阿里云 NLS (传统方式，需三个密钥)
        **kwargs: Additional provider-specific options

    Returns:
        An instance of BaseSTTService

    Raises:
        ValueError: If the provider is not supported
    """
    provider = (provider or os.getenv("STT_PROVIDER", "dashscope")).lower()

    if provider == "dashscope":
        # 阿里云百炼/灵积平台语音识别 (推荐)
        # 仅需 DASHSCOPE_API_KEY，使用 paraformer 模型
        from .dashscope_stt import DashScopeSTTService
        return DashScopeSTTService(**kwargs)
    elif provider == "aliyun":
        # 阿里云 NLS 传统方式 (需要 AccessKey ID/Secret + AppKey)
        from .aliyun_stt import AliyunSTTService
        return AliyunSTTService(**kwargs)
    elif provider == "xunfei":
        # Future: Implement Xunfei STT
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'dashscope' or 'aliyun' instead."
        )
    elif provider in ["baidu", "wenxin"]:
        # Future: Implement Baidu STT
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'dashscope' or 'aliyun' instead."
        )
    else:
        raise ValueError(
            f"Unknown STT provider: '{provider}'. "
            "Supported providers: dashscope, aliyun, xunfei, baidu"
        )


def create_embedding_service(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    **kwargs
) -> BaseEmbeddingService:
    """
    Create an Embedding service instance based on provider.

    Args:
        provider: Embedding provider ('qwen', 'baidu', 'zhipu')
                 Defaults to EMBEDDING_PROVIDER env var or 'qwen'
        model: Model name (e.g., 'text-embedding-v2')
               Defaults to EMBEDDING_MODEL env var
        **kwargs: Additional provider-specific options

    Returns:
        An instance of BaseEmbeddingService

    Raises:
        ValueError: If the provider is not supported
    """
    provider = (provider or os.getenv("EMBEDDING_PROVIDER", "qwen")).lower()
    model = model or os.getenv("EMBEDDING_MODEL")

    if provider == "qwen":
        from .qwen_embedding import QwenEmbeddingService
        return QwenEmbeddingService(model=model, **kwargs)
    elif provider in ["baidu", "wenxin"]:
        # Future: Implement Baidu Embedding
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'qwen' or implement the provider."
        )
    elif provider == "zhipu":
        # Future: Implement Zhipu Embedding
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'qwen' or implement the provider."
        )
    else:
        raise ValueError(
            f"Unknown Embedding provider: '{provider}'. "
            "Supported providers: qwen, baidu, zhipu"
        )


def create_vector_db_service(
    provider: Optional[str] = None,
    **kwargs
) -> BaseVectorDBService:
    """
    Create a Vector Database service instance based on provider.

    Args:
        provider: Vector DB provider ('chromadb', 'pinecone', 'qdrant')
                 Defaults to VECTOR_DB_PROVIDER env var or 'chromadb'
        **kwargs: Additional provider-specific options

    Returns:
        An instance of BaseVectorDBService

    Raises:
        ValueError: If the provider is not supported
    """
    provider = (provider or os.getenv("VECTOR_DB_PROVIDER", "chromadb")).lower()

    if provider == "chromadb":
        from .chroma_vector_db import ChromaVectorDBService
        return ChromaVectorDBService(**kwargs)
    elif provider == "pinecone":
        # Future: Implement Pinecone
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'chromadb' or implement the provider."
        )
    elif provider == "qdrant":
        # Future: Implement Qdrant
        raise ValueError(
            f"Provider '{provider}' not yet implemented. "
            "Please use 'chromadb' or implement the provider."
        )
    else:
        raise ValueError(
            f"Unknown Vector DB provider: '{provider}'. "
            "Supported providers: chromadb, pinecone, qdrant"
        )


# Singleton instances for reuse
_llm_service: Optional[BaseLLMService] = None
_stt_service: Optional[BaseSTTService] = None
_embedding_service: Optional[BaseEmbeddingService] = None
_vector_db_service: Optional[BaseVectorDBService] = None


def get_llm_service() -> BaseLLMService:
    """Get or create the singleton LLM service instance."""
    global _llm_service
    if _llm_service is None:
        _llm_service = create_llm_service()
    return _llm_service


def get_stt_service() -> BaseSTTService:
    """Get or create the singleton STT service instance."""
    global _stt_service
    if _stt_service is None:
        _stt_service = create_stt_service()
    return _stt_service


def get_embedding_service() -> BaseEmbeddingService:
    """Get or create the singleton Embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = create_embedding_service()
    return _embedding_service


def get_vector_db_service() -> BaseVectorDBService:
    """Get or create the singleton Vector DB service instance."""
    global _vector_db_service
    if _vector_db_service is None:
        _vector_db_service = create_vector_db_service()
    return _vector_db_service


def reset_services():
    """Reset all singleton instances (useful for testing)."""
    global _llm_service, _stt_service, _embedding_service, _vector_db_service
    _llm_service = None
    _stt_service = None
    _embedding_service = None
    _vector_db_service = None
