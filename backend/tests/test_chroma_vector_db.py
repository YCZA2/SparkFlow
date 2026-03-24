"""Chroma 向量数据库适配兼容性测试。"""

from __future__ import annotations

import pytest

from services.chroma_vector_db import ChromaVectorDBService


@pytest.mark.asyncio
async def test_namespace_exists_supports_string_collection_names() -> None:
    """namespace_exists 应兼容 Chroma v0.6 返回字符串列表。"""
    service = ChromaVectorDBService.__new__(ChromaVectorDBService)

    class _Client:
        """最小客户端替身，仅返回字符串集合名列表。"""

        def list_collections(self):
            """模拟新版 Chroma 的字符串返回值。"""
            return ["fragments_test-user-001", "knowledge_test-user-001"]

    service.client = _Client()

    assert await service.namespace_exists("fragments_test-user-001") is True
    assert await service.namespace_exists("missing") is False
