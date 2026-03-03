"""
Embedding 服务的抽象基类

本模块定义了文本嵌入服务的接口，允许在不同提供商之间轻松切换
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class EmbeddingResult:
    """嵌入操作的结果"""

    embedding: List[float]
    model: Optional[str] = None
    dimensions: Optional[int] = None


class BaseEmbeddingService(ABC):
    """
    Embedding 服务实现的抽象基类

    所有嵌入服务提供商都应实现此接口，以确保
    在不同后端之间保持一致的行为
    """

    def __init__(self, model: Optional[str] = None, **kwargs):
        """
        初始化嵌入服务

        Args:
            model: 要使用的模型标识符 (如 'text-embedding-v2')
            **kwargs: 提供商特定的配置
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
        为单个文本生成嵌入向量

        Args:
            text: 要嵌入的文本
            **kwargs: 额外的提供商特定参数

        Returns:
            EmbeddingResult 包含嵌入向量

        Raises:
            EmbeddingError: 嵌入生成失败时抛出
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
        为多个文本生成嵌入向量

        Args:
            texts: 要嵌入的文本列表
            batch_size: 每批处理的文本数量
            **kwargs: 额外的提供商特定参数

        Returns:
            EmbeddingResult 对象列表

        Raises:
            EmbeddingError: 嵌入生成失败时抛出
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查嵌入服务是否健康且可访问

        Returns:
            如果服务健康返回 True，否则返回 False
        """
        pass

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """
        获取嵌入向量的维度

        Returns:
            嵌入向量的维度数
        """
        pass


class EmbeddingError(Exception):
    """Embedding 服务错误的基类异常"""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "EMBEDDING_ERROR"
        self.details = details or {}


class EmbeddingRateLimitError(EmbeddingError):
    """超出速率限制时抛出"""

    def __init__(self, message: str = "超出速率限制"):
        super().__init__(message, code="RATE_LIMIT_ERROR")
