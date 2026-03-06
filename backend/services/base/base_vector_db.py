"""
向量数据库服务的抽象基类

本模块定义了向量数据库操作的接口，允许在不同提供商之间轻松切换
(ChromaDB, Pinecone, Qdrant 等)
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class VectorQueryResult:
    """向量相似度查询的结果"""

    id: str
    text: str
    score: float
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class VectorDocument:
    """要存储在向量数据库中的文档"""

    id: str
    text: str
    embedding: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None


class BaseVectorDBService(ABC):
    """
    向量数据库服务实现的抽象基类

    所有向量数据库提供商都应实现此接口，以确保
    在不同后端之间保持一致的行为

    服务使用基于命名空间的隔离策略，每个用户
    都有自己的集合/命名空间以确保数据隐私
    """

    def __init__(self, **kwargs):
        """
        初始化向量数据库服务

        Args:
            **kwargs: 提供商特定的配置
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
        在向量数据库中插入或更新文档

        Args:
            namespace: 命名空间/集合名称（通常基于 user_id）
            documents: 要插入或更新的文档列表
            **kwargs: 额外的提供商特定参数

        Returns:
            如果操作成功返回 True

        Raises:
            VectorDBError: 操作失败时抛出
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
        从数据库查询相似向量

        Args:
            namespace: 命名空间/集合名称
            query_embedding: 要搜索的嵌入向量
            top_k: 返回结果数量
            filter_metadata: 可选的元数据过滤器
            **kwargs: 额外的提供商特定参数

        Returns:
            按相关性排序（从高到低）的 VectorQueryResult 对象列表

        Raises:
            VectorDBError: 查询失败时抛出
        """
        pass

    @abstractmethod
    async def query_by_text(
        self,
        namespace: str,
        query_text: str,
        embedding_service: Any,  # BaseEmbeddingService 实例
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[VectorQueryResult]:
        """
        使用文本查询相似向量（自动嵌入查询文本）

        Args:
            namespace: 命名空间/集合名称
            query_text: 要搜索的文本
            embedding_service: 用于查询文本的嵌入服务
            top_k: 返回结果数量
            filter_metadata: 可选的元数据过滤器
            **kwargs: 额外的提供商特定参数

        Returns:
            按相关性排序的 VectorQueryResult 对象列表

        Raises:
            VectorDBError: 查询失败时抛出
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
        从向量数据库删除文档

        Args:
            namespace: 命名空间/集合名称
            document_ids: 要删除的文档 ID 列表
            **kwargs: 额外的提供商特定参数

        Returns:
            如果删除成功返回 True

        Raises:
            VectorDBError: 操作失败时抛出
        """
        pass

    @abstractmethod
    async def list_documents(
        self,
        namespace: str,
        include_embeddings: bool = True,
        **kwargs
    ) -> List[VectorDocument]:
        """
        读取命名空间中的全部文档。

        Args:
            namespace: 命名空间/集合名称
            include_embeddings: 是否返回 embedding
            **kwargs: 额外的提供商特定参数

        Returns:
            文档列表；命名空间不存在时返回空列表

        Raises:
            VectorDBError: 读取失败时抛出
        """
        pass

    @abstractmethod
    async def get_namespace_stats(
        self,
        namespace: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        获取命名空间的统计信息

        Args:
            namespace: 命名空间/集合名称
            **kwargs: 额外的提供商特定参数

        Returns:
            包含统计信息的字典（文档数量等）

        Raises:
            VectorDBError: 操作失败时抛出
        """
        pass

    @abstractmethod
    async def namespace_exists(self, namespace: str) -> bool:
        """
        检查命名空间是否存在

        Args:
            namespace: 命名空间/集合名称

        Returns:
            如果命名空间存在返回 True
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
        创建新的命名空间/集合

        Args:
            namespace: 命名空间/集合名称
            metadata: 命名空间的可选元数据
            **kwargs: 额外的提供商特定参数

        Returns:
            如果创建成功返回 True

        Raises:
            VectorDBError: 操作失败时抛出
        """
        pass

    @abstractmethod
    async def delete_namespace(self, namespace: str, **kwargs) -> bool:
        """
        删除命名空间及其所有文档

        Args:
            namespace: 命名空间/集合名称
            **kwargs: 额外的提供商特定参数

        Returns:
            如果删除成功返回 True

        Raises:
            VectorDBError: 操作失败时抛出
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查向量数据库服务是否健康且可访问

        Returns:
            如果服务健康返回 True，否则返回 False
        """
        pass


class VectorDBError(Exception):
    """向量数据库服务错误的基类异常"""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "VECTOR_DB_ERROR"
        self.details = details or {}


class VectorDBNotFoundError(VectorDBError):
    """命名空间或文档不存在时抛出"""

    def __init__(self, message: str = "命名空间或文档不存在"):
        super().__init__(message, code="NOT_FOUND_ERROR")


class VectorDBConnectionError(VectorDBError):
    """连接向量数据库失败时抛出"""

    def __init__(self, message: str = "连接向量数据库失败"):
        super().__init__(message, code="CONNECTION_ERROR")
