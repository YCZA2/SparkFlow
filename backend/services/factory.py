"""
服务工厂 - 基于配置创建服务实例。

本模块提供工厂函数，用于根据环境变量创建 LLM、STT、Embedding
和向量数据库服务。

使用方法:
    llm_service = create_llm_service()
    stt_service = create_stt_service()
    embedding_service = create_embedding_service()
    vector_db_service = create_vector_db_service()
"""

from typing import Optional

from core.config import settings
from .base import BaseLLMService, BaseSTTService, BaseEmbeddingService, BaseVectorDBService


def create_llm_service(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    **kwargs
) -> BaseLLMService:
    """
    基于提供商创建 LLM 服务实例。

    参数:
        provider: LLM 提供商 ('qwen', 'wenxin', 'zhipu', 'openai')
                 默认使用 LLM_PROVIDER 环境变量或 'qwen'
        model: 模型名称 (例如 'qwen-turbo', 'qwen-max')
               默认使用 LLM_MODEL 环境变量
        **kwargs: 额外的提供商特定选项

    返回:
        BaseLLMService 的实例

    抛出:
        ValueError: 如果提供商不受支持
    """
    provider = (provider or settings.LLM_PROVIDER or "qwen").lower()
    model = model or settings.LLM_MODEL

    if provider == "qwen":
        from .qwen_llm import QwenLLMService
        api_key = kwargs.pop("api_key", None) or settings.DASHSCOPE_API_KEY
        return QwenLLMService(model=model, api_key=api_key, **kwargs)
    elif provider in ["wenxin", "baidu"]:
        # 未来: 实现百度文心
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'qwen' 或实现该提供商。"
        )
    elif provider == "zhipu":
        # 未来: 实现智谱 AI
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'qwen' 或实现该提供商。"
        )
    elif provider == "openai":
        # 未来: 实现 OpenAI
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'qwen' 或实现该提供商。"
        )
    else:
        raise ValueError(
            f"未知的 LLM 提供商: '{provider}'。"
            "支持的提供商: qwen, wenxin, zhipu, openai"
        )


def create_stt_service(
    provider: Optional[str] = None,
    **kwargs
) -> BaseSTTService:
    """
    基于提供商创建 STT 服务实例。

    参数:
        provider: STT 提供商 ('dashscope', 'aliyun', 'xunfei', 'baidu')
                 默认使用 STT_PROVIDER 环境变量或 'dashscope'
                 'dashscope': 阿里云百炼/灵积平台 (推荐，仅需一个 API Key)
                 'aliyun': 阿里云 NLS (传统方式，需三个密钥)
        **kwargs: 额外的提供商特定选项

    返回:
        BaseSTTService 的实例

    抛出:
        ValueError: 如果提供商不受支持
    """
    provider = (provider or settings.STT_PROVIDER or "dashscope").lower()

    if provider == "dashscope":
        # 阿里云百炼/灵积平台语音识别 (推荐)
        # 从 settings 读取 DASHSCOPE_API_KEY
        from .dashscope_stt import DashScopeSTTService
        api_key = kwargs.pop("api_key", None) or settings.DASHSCOPE_API_KEY
        return DashScopeSTTService(api_key=api_key, **kwargs)
    elif provider == "aliyun":
        # 阿里云 NLS 传统方式 (需要 AccessKey ID/Secret + AppKey)
        from .aliyun_stt import AliyunSTTService
        return AliyunSTTService(**kwargs)
    elif provider == "xunfei":
        # 未来: 实现讯飞 STT
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'dashscope' 或 'aliyun'。"
        )
    elif provider in ["baidu", "wenxin"]:
        # 未来: 实现百度 STT
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'dashscope' 或 'aliyun'。"
        )
    else:
        raise ValueError(
            f"未知的 STT 提供商: '{provider}'。"
            "支持的提供商: dashscope, aliyun, xunfei, baidu"
        )


def create_embedding_service(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    **kwargs
) -> BaseEmbeddingService:
    """
    基于提供商创建 Embedding 服务实例。

    参数:
        provider: Embedding 提供商 ('qwen', 'baidu', 'zhipu')
                 默认使用 EMBEDDING_PROVIDER 环境变量或 'qwen'
        model: 模型名称 (例如 'text-embedding-v2')
               默认使用 EMBEDDING_MODEL 环境变量
        **kwargs: 额外的提供商特定选项

    返回:
        BaseEmbeddingService 的实例

    抛出:
        ValueError: 如果提供商不受支持
    """
    provider = (provider or settings.EMBEDDING_PROVIDER or "qwen").lower()
    model = model or settings.EMBEDDING_MODEL

    if provider == "qwen":
        from .qwen_embedding import QwenEmbeddingService
        api_key = kwargs.pop("api_key", None) or settings.DASHSCOPE_API_KEY
        return QwenEmbeddingService(model=model, api_key=api_key, **kwargs)
    elif provider in ["baidu", "wenxin"]:
        # 未来: 实现百度 Embedding
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'qwen' 或实现该提供商。"
        )
    elif provider == "zhipu":
        # 未来: 实现智谱 Embedding
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'qwen' 或实现该提供商。"
        )
    else:
        raise ValueError(
            f"未知的 Embedding 提供商: '{provider}'。"
            "支持的提供商: qwen, baidu, zhipu"
        )


def create_vector_db_service(
    provider: Optional[str] = None,
    **kwargs
) -> BaseVectorDBService:
    """
    基于提供商创建向量数据库服务实例。

    参数:
        provider: 向量数据库提供商 ('chromadb', 'pinecone', 'qdrant')
                 默认使用 VECTOR_DB_PROVIDER 环境变量或 'chromadb'
        **kwargs: 额外的提供商特定选项

    返回:
        BaseVectorDBService 的实例

    抛出:
        ValueError: 如果提供商不受支持
    """
    provider = (provider or settings.VECTOR_DB_PROVIDER or "chromadb").lower()

    if provider == "chromadb":
        from .chroma_vector_db import ChromaVectorDBService
        return ChromaVectorDBService(**kwargs)
    elif provider == "pinecone":
        # 未来: 实现 Pinecone
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'chromadb' 或实现该提供商。"
        )
    elif provider == "qdrant":
        # 未来: 实现 Qdrant
        raise ValueError(
            f"提供商 '{provider}' 尚未实现。"
            "请使用 'chromadb' 或实现该提供商。"
        )
    else:
        raise ValueError(
            f"未知的向量数据库提供商: '{provider}'。"
            "支持的提供商: chromadb, pinecone, qdrant"
        )


# 单例实例，用于复用
_llm_service: Optional[BaseLLMService] = None
_stt_service: Optional[BaseSTTService] = None
_embedding_service: Optional[BaseEmbeddingService] = None
_vector_db_service: Optional[BaseVectorDBService] = None


def get_llm_service() -> BaseLLMService:
    """获取或创建 LLM 服务单例实例。"""
    global _llm_service
    if _llm_service is None:
        _llm_service = create_llm_service()
    return _llm_service


def get_stt_service() -> BaseSTTService:
    """获取或创建 STT 服务单例实例。"""
    global _stt_service
    if _stt_service is None:
        _stt_service = create_stt_service()
    return _stt_service


def get_embedding_service() -> BaseEmbeddingService:
    """获取或创建 Embedding 服务单例实例。"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = create_embedding_service()
    return _embedding_service


def get_vector_db_service() -> BaseVectorDBService:
    """获取或创建向量数据库服务单例实例。"""
    global _vector_db_service
    if _vector_db_service is None:
        _vector_db_service = create_vector_db_service()
    return _vector_db_service


def reset_services():
    """重置所有单例实例 (测试时有用)。"""
    global _llm_service, _stt_service, _embedding_service, _vector_db_service
    _llm_service = None
    _stt_service = None
    _embedding_service = None
    _vector_db_service = None
