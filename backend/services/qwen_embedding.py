"""
通义千问 (Qwen) Embedding 服务实现。

使用阿里云 DashScope SDK 生成文本嵌入向量。
"""

import os
from typing import List, Optional

from core.logging_config import get_logger
from .base import BaseEmbeddingService, EmbeddingResult, EmbeddingError, EmbeddingRateLimitError

logger = get_logger(__name__)


class QwenEmbeddingService(BaseEmbeddingService):
    """
    使用阿里云通义千问的 Embedding 服务实现。

    支持模型: text-embedding-v2 (1536 维)
    """

    # 默认模型
    DEFAULT_MODEL = "text-embedding-v2"

    # 模型维度映射
    MODEL_DIMENSIONS = {
        "text-embedding-v2": 1536,
        "text-embedding-v1": 1536,
    }

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, **kwargs):
        """
        初始化通义千问 Embedding 服务。

        参数:
            model: 使用的嵌入模型 (默认: text-embedding-v2)
            api_key: DashScope API 密钥
            **kwargs: 额外配置
        """
        super().__init__(model=model or self.DEFAULT_MODEL, **kwargs)
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")

        if not self.api_key:
            raise EmbeddingError(
                "未找到 DashScope API 密钥。请设置 DASHSCOPE_API_KEY 环境变量。"
            )

        # 在此导入 dashscope 以避免依赖问题
        try:
            import dashscope
            self.dashscope = dashscope
            dashscope.api_key = self.api_key
        except ImportError:
            raise EmbeddingError(
                "未安装 dashscope 包。请运行: pip install dashscope"
            )

    async def embed(self, text: str, **kwargs) -> EmbeddingResult:
        """
        为单个文本生成嵌入向量。

        参数:
            text: 要嵌入的文本
            **kwargs: 额外参数

        返回:
            包含嵌入向量的 EmbeddingResult
        """
        if not text or not text.strip():
            raise EmbeddingError("文本不能为空")

        try:
            resp = self.dashscope.TextEmbedding.call(
                model=self.model,
                input=text,
                **kwargs
            )

            if resp.status_code != 200:
                error_code = resp.code if hasattr(resp, 'code') else "UNKNOWN"
                error_message = resp.message if hasattr(resp, 'message') else "未知错误"

                if error_code == "Throttling.RateQuota":
                    raise EmbeddingRateLimitError(f"超出速率限制: {error_message}")
                else:
                    raise EmbeddingError(f"API 错误: {error_message}", code=error_code)

            # 从响应中提取嵌入向量
            if resp.output and resp.output.get('embeddings'):
                embedding_data = resp.output['embeddings'][0]['embedding']
                return EmbeddingResult(
                    embedding=embedding_data,
                    model=self.model,
                    dimensions=len(embedding_data)
                )
            else:
                raise EmbeddingError("空的嵌入响应", code="EMPTY_RESPONSE")

        except (EmbeddingError,):
            raise
        except Exception as e:
            raise EmbeddingError(f"生成嵌入失败: {str(e)}", code="EMBEDDING_ERROR")

    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 10,
        **kwargs
    ) -> List[EmbeddingResult]:
        """
        为多个文本生成嵌入向量。

        参数:
            texts: 要嵌入的文本列表
            batch_size: 每批文本数量 (千问每次调用最多支持 25 个)
            **kwargs: 额外参数

        返回:
            EmbeddingResult 对象列表
        """
        if not texts:
            return []

        results = []

        # 分批处理 (千问每次调用最多支持 25 个文本)
        effective_batch_size = min(batch_size, 25)

        for i in range(0, len(texts), effective_batch_size):
            batch = texts[i:i + effective_batch_size]

            try:
                # 过滤空文本
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
                    error_message = resp.message if hasattr(resp, 'message') else "未知错误"
                    raise EmbeddingError(f"批量 API 错误: {error_message}", code=error_code)

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
                    raise EmbeddingError("空的批量嵌入响应", code="EMPTY_RESPONSE")

            except Exception as e:
                # 如果批量失败，尝试单独调用作为回退
                logger.warning("batch_embedding_failed_falling_back_to_single", exc_info=True)
                for text in batch:
                    try:
                        result = await self.embed(text)
                        results.append(result)
                    except Exception:
                        logger.warning("single_embedding_fallback_failed", exc_info=True)
                        results.append(None)

        return results

    async def health_check(self) -> bool:
        """
        检查 Embedding 服务是否健康。

        返回:
            健康返回 True
        """
        try:
            await self.embed("Hello world")
            return True
        except Exception:
            return False

    @property
    def dimensions(self) -> int:
        """
        获取嵌入向量的维度。

        返回:
            维度数量 (text-embedding-v2 为 1536)
        """
        return self.MODEL_DIMENSIONS.get(self.model, 1536)
