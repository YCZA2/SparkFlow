"""
ChromaDB 向量数据库服务实现。

本地向量数据库，零外部依赖。
支持用户级命名空间隔离。
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
    使用 ChromaDB (本地) 的向量数据库服务。

    特性:
    - 零外部依赖
    - 通过集合实现用户级命名空间隔离
    - 持久化存储
    - 易于迁移到云服务
    """

    def __init__(self, db_path: Optional[str] = None, **kwargs):
        """
        初始化 ChromaDB 服务。

        参数:
            db_path: 存储 ChromaDB 数据的路径 (默认: ./chroma_data)
            **kwargs: 额外配置
        """
        super().__init__(**kwargs)

        self.db_path = db_path or os.getenv("CHROMADB_PATH", "./chroma_data")

        # 导入 chromadb
        try:
            import chromadb
            from chromadb.config import Settings
            self.chromadb = chromadb
            self.Settings = Settings
        except ImportError:
            raise VectorDBError(
                "未安装 chromadb 包。请运行: pip install chromadb"
            )

        # 创建持久化存储的客户端
        try:
            self.client = chromadb.PersistentClient(
                path=self.db_path,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=False,
                )
            )
        except Exception as e:
            raise VectorDBConnectionError(f"初始化 ChromaDB 失败: {str(e)}")

    async def upsert(
        self,
        namespace: str,
        documents: List[VectorDocument],
        **kwargs
    ) -> bool:
        """
        在向量数据库中插入或更新文档。

        参数:
            namespace: 集合名称 (通常基于用户)
            documents: 要插入或更新的文档列表
            **kwargs: 额外参数

        返回:
            成功返回 True
        """
        if not documents:
            return True

        try:
            # 获取或创建集合
            collection = self.client.get_or_create_collection(
                name=namespace,
                metadata={"hnsw:space": "cosine"}
            )

            # 为 ChromaDB 准备数据
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

            # 插入或更新到 ChromaDB
            if embeddings:
                # 如果提供了嵌入向量，直接使用
                collection.upsert(
                    ids=ids,
                    documents=texts,
                    embeddings=embeddings,
                    metadatas=metadatas
                )
            else:
                # 否则，ChromaDB 将生成嵌入向量
                collection.upsert(
                    ids=ids,
                    documents=texts,
                    metadatas=metadatas
                )

            return True

        except Exception as e:
            raise VectorDBError(f"插入或更新文档失败: {str(e)}", code="UPSERT_ERROR")

    async def query(
        self,
        namespace: str,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[VectorQueryResult]:
        """
        从数据库查询相似向量。

        参数:
            namespace: 集合名称
            query_embedding: 查询向量
            top_k: 返回结果数量
            filter_metadata: 可选的元数据过滤器
            **kwargs: 额外参数

        返回:
            VectorQueryResult 对象列表
        """
        try:
            # 检查集合是否存在
            if not await self.namespace_exists(namespace):
                return []

            collection = self.client.get_collection(name=namespace)

            # 查询
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=filter_metadata,
                include=["documents", "metadatas", "distances"]
            )

            # 转换为 VectorQueryResult
            output = []
            if results and results["ids"]:
                for i, doc_id in enumerate(results["ids"][0]):
                    # 将余弦距离转换为相似度分数
                    # ChromaDB 返回距离，其中 0 表示完全相同
                    distance = results["distances"][0][i] if results["distances"] else 0
                    score = 1 - distance  # 转换为相似度分数

                    output.append(VectorQueryResult(
                        id=doc_id,
                        text=results["documents"][0][i] if results["documents"] else "",
                        score=score,
                        metadata=results["metadatas"][0][i] if results["metadatas"] else None
                    ))

            return output

        except Exception as e:
            raise VectorDBError(f"查询失败: {str(e)}", code="QUERY_ERROR")

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
        使用文本查询 (自动嵌入查询)。

        参数:
            namespace: 集合名称
            query_text: 查询文本
            embedding_service: 要使用的嵌入服务
            top_k: 返回结果数量
            filter_metadata: 可选的元数据过滤器
            **kwargs: 额外参数

        返回:
            VectorQueryResult 对象列表
        """
        # 为查询文本生成嵌入向量
        embedding_result = await embedding_service.embed(query_text)

        # 使用嵌入向量进行查询
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
        从向量数据库删除文档。

        参数:
            namespace: 集合名称
            document_ids: 要删除的文档 ID 列表
            **kwargs: 额外参数

        返回:
            成功返回 True
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
            raise VectorDBError(f"删除文档失败: {str(e)}", code="DELETE_ERROR")

    async def list_documents(
        self,
        namespace: str,
        include_embeddings: bool = True,
        **kwargs
    ) -> List[VectorDocument]:
        """
        读取命名空间中的全部文档。

        参数:
            namespace: 集合名称
            include_embeddings: 是否包含 embedding
            **kwargs: 额外参数

        返回:
            VectorDocument 对象列表
        """
        try:
            if not await self.namespace_exists(namespace):
                return []

            collection = self.client.get_collection(name=namespace)
            include = ["documents", "metadatas"]
            if include_embeddings:
                include.append("embeddings")

            results = collection.get(include=include)
            ids = results.get("ids") or []
            documents = results.get("documents") or []
            metadatas = results.get("metadatas") or []
            embeddings = results.get("embeddings") or []

            output: List[VectorDocument] = []
            for index, doc_id in enumerate(ids):
                output.append(
                    VectorDocument(
                        id=doc_id,
                        text=documents[index] if index < len(documents) else "",
                        embedding=embeddings[index] if include_embeddings and index < len(embeddings) else None,
                        metadata=metadatas[index] if index < len(metadatas) else None,
                    )
                )

            return output

        except Exception as e:
            raise VectorDBError(f"读取文档失败: {str(e)}", code="LIST_DOCUMENTS_ERROR")

    async def get_namespace_stats(
        self,
        namespace: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        获取命名空间的统计信息。

        参数:
            namespace: 集合名称
            **kwargs: 额外参数

        返回:
            包含统计信息的字典
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
            raise VectorDBError(f"获取统计信息失败: {str(e)}", code="STATS_ERROR")

    async def namespace_exists(self, namespace: str) -> bool:
        """
        检查命名空间是否存在。

        参数:
            namespace: 集合名称

        返回:
            命名空间存在返回 True
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
        创建新的命名空间/集合。

        参数:
            namespace: 集合名称
            metadata: 可选的元数据
            **kwargs: 额外参数

        返回:
            成功返回 True
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
            raise VectorDBError(f"创建命名空间失败: {str(e)}", code="CREATE_ERROR")

    async def delete_namespace(self, namespace: str, **kwargs) -> bool:
        """
        删除命名空间及其所有文档。

        参数:
            namespace: 集合名称
            **kwargs: 额外参数

        返回:
            成功返回 True
        """
        try:
            if not await self.namespace_exists(namespace):
                return True

            self.client.delete_collection(name=namespace)
            return True

        except Exception as e:
            raise VectorDBError(f"删除命名空间失败: {str(e)}", code="DELETE_ERROR")

    async def health_check(self) -> bool:
        """
        检查向量数据库是否健康。

        返回:
            健康返回 True
        """
        try:
            # 尝试列出集合作为健康检查
            self.client.list_collections()
            return True
        except Exception:
            return False


# 为向后兼容，保留旧名称
VectorService = ChromaVectorDBService
