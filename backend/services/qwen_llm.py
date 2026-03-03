"""
Qwen (Tongyi Qianwen) LLM Service Implementation.

Uses Alibaba Cloud's DashScope SDK to interact with Qwen models.
"""

import os
from typing import Optional, AsyncGenerator

from .base import BaseLLMService, LLMError, LLMRateLimitError, LLMAuthenticationError, LLMTimeoutError


class QwenLLMService(BaseLLMService):
    """
    LLM service implementation using Alibaba Cloud's Tongyi Qianwen (Qwen).

    Supports models: qwen-turbo, qwen-plus, qwen-max, etc.
    """

    # Default model to use
    DEFAULT_MODEL = "qwen-turbo"

    # Available models
    AVAILABLE_MODELS = [
        "qwen-turbo",      # Fast and cost-effective
        "qwen-plus",       # Balanced performance
        "qwen-max",        # Best quality
        "qwen-max-longcontext",  # Extended context window
    ]

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, **kwargs):
        """
        Initialize the Qwen LLM service.

        Args:
            model: The Qwen model to use (default: qwen-turbo)
            api_key: DashScope API key (reads from DASHSCOPE_API_KEY env var if not provided)
            **kwargs: Additional configuration options
        """
        super().__init__(model=model or self.DEFAULT_MODEL, **kwargs)
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")

        if not self.api_key:
            raise LLMError(
                "DashScope API key not found. Please set DASHSCOPE_API_KEY environment variable."
            )

        # Import dashscope here to avoid dependency issues if not using this provider
        try:
            import dashscope
            self.dashscope = dashscope
            dashscope.api_key = self.api_key
        except ImportError:
            raise LLMError(
                "dashscope package not installed. Run: pip install dashscope"
            )

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """
        Generate text using Qwen model.

        Args:
            system_prompt: System instructions
            user_message: User input
            temperature: Sampling temperature (0.0 - 1.0)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters

        Returns:
            Generated text response
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        try:
            response = self.dashscope.Generation.call(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens or 2000,
                result_format="message",
                **kwargs
            )

            # Check for errors
            if response.status_code != 200:
                error_code = response.code if hasattr(response, 'code') else "UNKNOWN"
                error_message = response.message if hasattr(response, 'message') else "Unknown error"

                if error_code == "Throttling.RateQuota":
                    raise LLMRateLimitError(f"Rate limit exceeded: {error_message}")
                elif error_code in ["InvalidApiKey", "AuthenticationFailed"]:
                    raise LLMAuthenticationError(f"Authentication failed: {error_message}")
                else:
                    raise LLMError(f"API error: {error_message}", code=error_code)

            # Extract the generated text
            if response.output and response.output.choices:
                return response.output.choices[0].message.content
            else:
                raise LLMError("Empty response from API", code="EMPTY_RESPONSE")

        except (LLMError,):
            raise
        except Exception as e:
            raise LLMError(f"Failed to generate text: {str(e)}", code="GENERATION_ERROR")

    async def generate_stream(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        Generate text with streaming response.

        Args:
            system_prompt: System instructions
            user_message: User input
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters

        Yields:
            Text chunks as they are generated
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        try:
            response = self.dashscope.Generation.call(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens or 2000,
                result_format="message",
                stream=True,
                **kwargs
            )

            for chunk in response:
                if chunk.status_code != 200:
                    error_code = chunk.code if hasattr(chunk, 'code') else "UNKNOWN"
                    error_message = chunk.message if hasattr(chunk, 'message') else "Unknown error"
                    raise LLMError(f"Stream error: {error_message}", code=error_code)

                if chunk.output and chunk.output.choices:
                    content = chunk.output.choices[0].message.content
                    if content:
                        yield content

        except (LLMError,):
            raise
        except Exception as e:
            raise LLMError(f"Stream failed: {str(e)}", code="STREAM_ERROR")

    async def health_check(self) -> bool:
        """
        Check if the Qwen service is healthy.

        Returns:
            True if healthy
        """
        try:
            # Try a simple generation to check connectivity
            await self.generate(
                system_prompt="You are a helpful assistant.",
                user_message="Hi",
                max_tokens=5
            )
            return True
        except Exception:
            return False
