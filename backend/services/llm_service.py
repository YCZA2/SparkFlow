"""
LLM 业务逻辑服务层

提供基于 LLM 的高级业务功能，如摘要生成、标签生成等。
这些函数封装了对底层 LLM 服务的调用，提供面向业务的接口。
"""

import json
import logging
import re
from typing import List, Optional

from .base import LLMError

# 配置日志记录器
logger = logging.getLogger(__name__)


# ========== 摘要生成相关的 Prompt 模板 ==========

SUMMARY_SYSTEM_PROMPT = """你是一个专业的内容摘要助手。你的任务是根据用户提供的口述内容，生成一句简短的中文摘要，描述核心主题。

要求：
1. 摘要长度控制在 20 字以内
2. 使用简洁、准确的语言
3. 突出核心主题或关键观点
4. 只返回摘要文本，不要有其他说明或标点符号外的额外内容"""

SUMMARY_USER_PROMPT_TEMPLATE = """请为以下内容生成一句话摘要：

{transcript}"""


# ========== 标签生成相关的 Prompt 模板 ==========

TAGS_SYSTEM_PROMPT = """你是一个专业的内容标签助手。你的任务是根据用户提供的内容，生成 2-4 个中文标签关键词。

要求：
1. 生成 2-4 个标签
2. 每个标签 2-6 个字
3. 标签应准确概括内容的核心主题、关键词或分类
4. 以 JSON 数组格式返回，如 ["标签1", "标签2", "标签3"]
5. 只返回 JSON 数组，不要有其他说明"""

TAGS_USER_PROMPT_TEMPLATE = """请为以下内容生成标签关键词：

{transcript}"""


async def generate_summary(transcript: str, llm_service=None) -> str:
    """
    根据转写文本生成一句话摘要。

    参数:
        transcript: 转写文本内容
        llm_service: LLM 服务实例 (可选，默认使用工厂获取)

    返回:
        生成的摘要文本 (20字以内)

    抛出:
        LLMError: 如果生成失败
    """
    if not transcript or not transcript.strip():
        logger.warning("[Summary] 转写文本为空，返回默认摘要")
        return "空内容"

    # 获取 LLM 服务
    if llm_service is None:
        from .factory import get_llm_service
        llm_service = get_llm_service()

    # 构造 prompt
    user_message = SUMMARY_USER_PROMPT_TEMPLATE.format(transcript=transcript)

    try:
        logger.info(f"[Summary] 开始生成摘要，文本长度: {len(transcript)}")

        # 调用 LLM 生成摘要
        summary = await llm_service.generate(
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,  # 使用较低温度以获得更稳定的输出
            max_tokens=50,    # 摘要不需要太长
        )

        # 清理输出：去除首尾空白和引号
        summary = summary.strip().strip('"\'""\'')

        # 确保摘要不超过 20 字
        if len(summary) > 20:
            summary = summary[:20]
            logger.info(f"[Summary] 摘要已截断至 20 字: {summary}")

        logger.info(f"[Summary] 摘要生成成功: {summary}")
        return summary

    except LLMError as e:
        logger.error(f"[Summary] LLM 错误: {str(e)}")
        # 返回一个基于文本前缀的默认摘要
        return _generate_fallback_summary(transcript)
    except Exception as e:
        logger.error(f"[Summary] 生成摘要失败: {str(e)}")
        return _generate_fallback_summary(transcript)


def _generate_fallback_summary(transcript: str) -> str:
    """
    生成后备摘要（当 LLM 调用失败时）。

    参数:
        transcript: 转写文本

    返回:
        基于文本前缀的简化摘要
    """
    # 截取前 15 个字符作为摘要
    if len(transcript) <= 15:
        return transcript
    return transcript[:15] + "..."


async def generate_tags(transcript: str, llm_service=None) -> List[str]:
    """
    根据转写文本生成标签列表。

    参数:
        transcript: 转写文本内容
        llm_service: LLM 服务实例 (可选，默认使用工厂获取)

    返回:
        标签列表 (2-4 个字符串)

    抛出:
        LLMError: 如果生成失败
    """
    if not transcript or not transcript.strip():
        logger.warning("[Tags] 转写文本为空，返回默认标签")
        return ["其他"]

    # 获取 LLM 服务
    if llm_service is None:
        from .factory import get_llm_service
        llm_service = get_llm_service()

    # 构造 prompt
    user_message = TAGS_USER_PROMPT_TEMPLATE.format(transcript=transcript)

    try:
        logger.info(f"[Tags] 开始生成标签，文本长度: {len(transcript)}")

        # 调用 LLM 生成标签
        response = await llm_service.generate(
            system_prompt=TAGS_SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,  # 使用较低温度以获得更稳定的输出
            max_tokens=100,   # 标签不需要太长
        )

        # 解析 JSON 数组
        tags = _parse_tags_response(response)

        # 确保标签数量在 2-4 之间
        if len(tags) < 2:
            # 如果标签太少，添加默认标签
            default_tags = ["想法", "灵感"]
            tags = tags + default_tags[:2 - len(tags)]
        elif len(tags) > 4:
            # 如果标签太多，只取前 4 个
            tags = tags[:4]

        logger.info(f"[Tags] 标签生成成功: {tags}")
        return tags

    except LLMError as e:
        logger.error(f"[Tags] LLM 错误: {str(e)}")
        return _generate_fallback_tags(transcript)
    except Exception as e:
        logger.error(f"[Tags] 生成标签失败: {str(e)}")
        return _generate_fallback_tags(transcript)


def _parse_tags_response(response: str) -> List[str]:
    """
    解析 LLM 返回的标签响应。

    参数:
        response: LLM 返回的原始响应文本

    返回:
        解析后的标签列表
    """
    # 清理响应文本
    response = response.strip()

    # 尝试提取 JSON 数组
    # 模式1: 直接是 JSON 数组格式
    json_match = re.search(r'\[.*?\]', response, re.DOTALL)
    if json_match:
        try:
            tags = json.loads(json_match.group())
            if isinstance(tags, list):
                # 清理并验证每个标签
                return [str(tag).strip().strip('"\'""\'') for tag in tags if tag]
        except json.JSONDecodeError:
            logger.warning(f"[Tags] JSON 解析失败: {json_match.group()}")

    # 模式2: 尝试按行或逗号分割
    # 移除可能的列表标记
    response = re.sub(r'^[\d\-\*\.]+\s*', '', response, flags=re.MULTILINE)

    # 按逗号、顿号或换行分割
    parts = re.split(r'[,，、\n]+', response)
    tags = [p.strip().strip('"\'""\'') for p in parts if p.strip()]

    if tags:
        return tags

    # 如果都无法解析，返回默认标签
    logger.warning(f"[Tags] 无法解析标签响应: {response}")
    return ["其他"]


def _generate_fallback_tags(transcript: str) -> List[str]:
    """
    生成后备标签（当 LLM 调用失败时）。

    参数:
        transcript: 转写文本

    返回:
        基于简单规则的标签列表
    """
    # 简单的关键词匹配规则
    keyword_tags = {
        "定位": ["定位", "品牌"],
        "营销": ["营销", "策略"],
        "创业": ["创业", "商业"],
        "产品": ["产品", "设计"],
        "用户": ["用户", "运营"],
        "增长": ["增长", "方法"],
        "思考": ["思考", "想法"],
        "学习": ["学习", "成长"],
    }

    # 检查关键词
    for keyword, tags in keyword_tags.items():
        if keyword in transcript:
            return tags

    # 默认标签
    return ["灵感", "想法"]


async def generate_summary_and_tags(
    transcript: str,
    llm_service=None
) -> tuple[str, List[str]]:
    """
    同时生成摘要和标签（优化调用，减少延迟）。

    参数:
        transcript: 转写文本内容
        llm_service: LLM 服务实例 (可选)

    返回:
        元组 (摘要, 标签列表)
    """
    import asyncio

    # 并行调用摘要和标签生成
    summary_task = generate_summary(transcript, llm_service)
    tags_task = generate_tags(transcript, llm_service)

    try:
        summary, tags = await asyncio.gather(
            summary_task,
            tags_task,
            return_exceptions=True
        )

        # 处理可能的异常
        if isinstance(summary, Exception):
            logger.error(f"[Summary] 并行调用异常: {summary}")
            summary = _generate_fallback_summary(transcript)

        if isinstance(tags, Exception):
            logger.error(f"[Tags] 并行调用异常: {tags}")
            tags = _generate_fallback_tags(transcript)

        return summary, tags

    except Exception as e:
        logger.error(f"[Summary+Tags] 并行生成失败: {str(e)}")
        return _generate_fallback_summary(transcript), _generate_fallback_tags(transcript)