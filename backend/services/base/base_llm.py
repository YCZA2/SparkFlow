"""
LLM (大语言模型) 服务的抽象基类

本模块定义了 LLM 服务的接口，允许在不同提供商之间轻松切换
(通义千问、文心一言、智谱 AI、OpenAI 等)
"""

from abc import ABC, abstractmethod
from typing import Optional, AsyncGenerator


class BaseLLMService(ABC):
    """
    LLM 服务实现的抽象基类

    所有 LLM 提供商都应实现此接口，以确保
    在不同后端之间保持一致的行为
    """

    def __init__(self, model: Optional[str] = None, **kwargs):
        """
        初始化 LLM 服务

        Args:
            model: 要使用的模型标识符 (如 'qwen-turbo', 'gpt-4')
            **kwargs: 额外的提供商特定配置
        """
        self.model = model
        self.config = kwargs

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """
        从 LLM 生成文本补全

        Args:
            system_prompt: 定义 AI 角色的系统提示词
            user_message: 用户的输入消息
            temperature: 采样温度 (0.0 - 1.0)
            max_tokens: 要生成的最大令牌数
            **kwargs: 额外的生成参数

        Returns:
            生成的文本响应

        Raises:
            LLMError: API 调用失败时抛出
        """
        pass

    @abstractmethod
    async def generate_stream(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        以流式响应方式生成文本补全

        Args:
            system_prompt: 定义 AI 角色的系统提示词
            user_message: 用户的输入消息
            temperature: 采样温度 (0.0 - 1.0)
            max_tokens: 要生成的最大令牌数
            **kwargs: 额外的生成参数

        Yields:
            生成的文本响应片段

        Raises:
            LLMError: API 调用失败时抛出
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查 LLM 服务是否健康且可访问

        Returns:
            如果服务健康返回 True，否则返回 False
        """
        pass


class LLMError(Exception):
    """LLM 服务错误的基类异常"""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "LLM_ERROR"
        self.details = details or {}


class LLMRateLimitError(LLMError):
    """超出速率限制时抛出"""

    def __init__(self, message: str = "超出速率限制", retry_after: Optional[int] = None):
        super().__init__(message, code="RATE_LIMIT_ERROR")
        self.retry_after = retry_after


class LLMAuthenticationError(LLMError):
    """认证失败时抛出"""

    def __init__(self, message: str = "认证失败"):
        super().__init__(message, code="AUTHENTICATION_ERROR")


class LLMTimeoutError(LLMError):
    """请求超时时抛出"""

    def __init__(self, message: str = "请求超时"):
        super().__init__(message, code="TIMEOUT_ERROR")
