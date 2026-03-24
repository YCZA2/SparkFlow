"""
通义千问 (Qwen) LLM 服务实现。

使用阿里云 DashScope SDK 与 Qwen 模型进行交互。
"""

import os
import asyncio
from pathlib import Path
from typing import Optional, AsyncGenerator

from modules.shared.prompt_loader import load_prompt_text

from .base import BaseLLMService, LLMError, LLMRateLimitError, LLMAuthenticationError, LLMTimeoutError

_HEALTHCHECK_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "health_check_system.txt"
_HEALTHCHECK_USER_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "health_check_user.txt"


class QwenLLMService(BaseLLMService):
    """
    使用阿里云通义千问 (Qwen) 的 LLM 服务实现。

    支持模型: qwen-turbo, qwen-plus, qwen-max 等。
    """

    # 默认使用的模型
    DEFAULT_MODEL = "qwen-turbo"

    # 可用模型列表
    AVAILABLE_MODELS = [
        "qwen-turbo",      # 快速且性价比高
        "qwen-plus",       # 性能均衡
        "qwen-max",        # 最佳质量
        "qwen-max-longcontext",  # 扩展上下文窗口
    ]

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, **kwargs):
        """
        初始化通义千问 LLM 服务。

        参数:
            model: 使用的 Qwen 模型 (默认: qwen-turbo)
            api_key: DashScope API 密钥 (如未提供则从 DASHSCOPE_API_KEY 环境变量读取)
            **kwargs: 额外的配置选项
        """
        super().__init__(model=model or self.DEFAULT_MODEL, **kwargs)
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")

        if not self.api_key:
            raise LLMError(
                "未找到 DashScope API 密钥。请设置 DASHSCOPE_API_KEY 环境变量。"
            )

        # 在此导入 dashscope 以避免如果不使用此提供商时的依赖问题
        try:
            import dashscope
            self.dashscope = dashscope
            dashscope.api_key = self.api_key
        except ImportError:
            raise LLMError(
                "未安装 dashscope 包。请运行: pip install dashscope"
            )

    def _generate_sync(
        self,
        *,
        system_prompt: str,
        user_message: str,
        temperature: float,
        max_tokens: Optional[int],
        extra_kwargs: dict,
    ) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        response = self.dashscope.Generation.call(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens or 2000,
            result_format="message",
            **extra_kwargs,
        )

        if response.status_code != 200:
            error_code = response.code if hasattr(response, 'code') else "UNKNOWN"
            error_message = response.message if hasattr(response, 'message') else "未知错误"

            if error_code == "Throttling.RateQuota":
                raise LLMRateLimitError(f"超出速率限制: {error_message}")
            if error_code in ["InvalidApiKey", "AuthenticationFailed"]:
                raise LLMAuthenticationError(f"认证失败: {error_message}")
            raise LLMError(f"API 错误: {error_message}", code=error_code)

        if response.output and response.output.choices:
            return response.output.choices[0].message.content
        raise LLMError("API 返回空响应", code="EMPTY_RESPONSE")

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """
        使用 Qwen 模型生成文本。

        参数:
            system_prompt: 系统指令
            user_message: 用户输入
            temperature: 采样温度 (0.0 - 1.0)
            max_tokens: 最大生成 token 数
            **kwargs: 额外参数

        返回:
            生成的文本响应
        """
        try:
            return await asyncio.to_thread(
                self._generate_sync,
                system_prompt=system_prompt,
                user_message=user_message,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_kwargs=kwargs,
            )
        except (LLMError,):
            raise
        except Exception as e:
            raise LLMError(f"生成文本失败: {str(e)}", code="GENERATION_ERROR")

    async def generate_stream(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        使用流式响应生成文本。

        参数:
            system_prompt: 系统指令
            user_message: 用户输入
            temperature: 采样温度
            max_tokens: 最大生成 token 数
            **kwargs: 额外参数

        生成:
            生成的文本块
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
                    error_message = chunk.message if hasattr(chunk, 'message') else "未知错误"
                    raise LLMError(f"流式错误: {error_message}", code=error_code)

                if chunk.output and chunk.output.choices:
                    content = chunk.output.choices[0].message.content
                    if content:
                        yield content

        except (LLMError,):
            raise
        except Exception as e:
            raise LLMError(f"流式传输失败: {str(e)}", code="STREAM_ERROR")

    async def health_check(self) -> bool:
        """
        检查通义千问服务是否健康。

        返回:
            健康返回 True
        """
        try:
            # 尝试简单生成以检查连接性
            await self.generate(
                system_prompt=load_prompt_text(_HEALTHCHECK_SYSTEM_PROMPT_PATH),
                user_message=load_prompt_text(_HEALTHCHECK_USER_PROMPT_PATH),
                max_tokens=5
            )
            return True
        except Exception:
            return False
