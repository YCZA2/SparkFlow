"""
Abstract base class for LLM (Large Language Model) services.

This module defines the interface for LLM services, allowing easy switching
between different providers (Qwen, Wenxin, Zhipu, OpenAI, etc.)
"""

from abc import ABC, abstractmethod
from typing import Optional, AsyncGenerator


class BaseLLMService(ABC):
    """
    Abstract base class for LLM service implementations.

    All LLM providers should implement this interface to ensure
    consistent behavior across different backends.
    """

    def __init__(self, model: Optional[str] = None, **kwargs):
        """
        Initialize the LLM service.

        Args:
            model: The model identifier to use (e.g., 'qwen-turbo', 'gpt-4')
            **kwargs: Additional provider-specific configuration
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
        Generate text completion from the LLM.

        Args:
            system_prompt: The system prompt defining the AI's role
            user_message: The user's input message
            temperature: Sampling temperature (0.0 - 1.0)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional generation parameters

        Returns:
            The generated text response

        Raises:
            LLMError: If the API call fails
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
        Generate text completion with streaming response.

        Args:
            system_prompt: The system prompt defining the AI's role
            user_message: The user's input message
            temperature: Sampling temperature (0.0 - 1.0)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional generation parameters

        Yields:
            Chunks of the generated text response

        Raises:
            LLMError: If the API call fails
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the LLM service is healthy and accessible.

        Returns:
            True if the service is healthy, False otherwise
        """
        pass


class LLMError(Exception):
    """Base exception for LLM service errors."""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "LLM_ERROR"
        self.details = details or {}


class LLMRateLimitError(LLMError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: Optional[int] = None):
        super().__init__(message, code="RATE_LIMIT_ERROR")
        self.retry_after = retry_after


class LLMAuthenticationError(LLMError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, code="AUTHENTICATION_ERROR")


class LLMTimeoutError(LLMError):
    """Raised when the request times out."""

    def __init__(self, message: str = "Request timed out"):
        super().__init__(message, code="TIMEOUT_ERROR")
