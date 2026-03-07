from __future__ import annotations

import asyncio
import json
import logging
import re

from modules.shared.ports import TextGenerationProvider

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """你是一个专业的内容摘要助手。你的任务是根据用户提供的口述内容，生成一句简短的中文摘要，描述核心主题。

要求：
1. 摘要长度控制在 20 字以内
2. 使用简洁、准确的语言
3. 突出核心主题或关键观点
4. 只返回摘要文本，不要有其他说明或标点符号外的额外内容"""

SUMMARY_USER_PROMPT_TEMPLATE = """请为以下内容生成一句话摘要：

{transcript}"""

TAGS_SYSTEM_PROMPT = """你是一个专业的内容标签助手。你的任务是根据用户提供的内容，生成 2-4 个中文标签关键词。

要求：
1. 生成 2-4 个标签
2. 每个标签 2-6 个字
3. 标签应准确概括内容的核心主题、关键词或分类
4. 以 JSON 数组格式返回，如 ["标签1", "标签2", "标签3"]
5. 只返回 JSON 数组，不要有其他说明"""

TAGS_USER_PROMPT_TEMPLATE = """请为以下内容生成标签关键词：

{transcript}"""


def build_fallback_summary_and_tags(transcript: str) -> tuple[str, list[str]]:
    return (_generate_fallback_summary(transcript), _generate_fallback_tags(transcript))


async def generate_summary_and_tags(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    timeout_seconds: float | None = None,
) -> tuple[str, list[str]]:
    if timeout_seconds is not None:
        return await asyncio.wait_for(
            _generate_summary_and_tags(transcript, llm_provider=llm_provider),
            timeout=timeout_seconds,
        )
    return await _generate_summary_and_tags(transcript, llm_provider=llm_provider)


async def _generate_summary_and_tags(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
) -> tuple[str, list[str]]:
    if not transcript or not transcript.strip():
        logger.warning("[Enrichment] transcript is empty, using fallback content")
        return ("空内容", ["其他"])

    summary = await _generate_summary(transcript, llm_provider=llm_provider)
    tags = await _generate_tags(transcript, llm_provider=llm_provider)
    return (summary, tags)


async def _generate_summary(transcript: str, *, llm_provider: TextGenerationProvider) -> str:
    user_message = SUMMARY_USER_PROMPT_TEMPLATE.format(transcript=transcript)
    try:
        summary = await llm_provider.generate(
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,
            max_tokens=50,
        )
        summary = summary.strip().strip('"\'""\'')
        if len(summary) > 20:
            summary = summary[:20]
        return summary or _generate_fallback_summary(transcript)
    except Exception:
        logger.warning("[Enrichment] summary generation failed, using fallback", exc_info=True)
        return _generate_fallback_summary(transcript)


async def _generate_tags(transcript: str, *, llm_provider: TextGenerationProvider) -> list[str]:
    user_message = TAGS_USER_PROMPT_TEMPLATE.format(transcript=transcript)
    try:
        response = await llm_provider.generate(
            system_prompt=TAGS_SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,
            max_tokens=100,
        )
        tags = _parse_tags_response(response)
        if len(tags) < 2:
            tags = tags + ["想法", "灵感"][: 2 - len(tags)]
        elif len(tags) > 4:
            tags = tags[:4]
        return tags
    except Exception:
        logger.warning("[Enrichment] tag generation failed, using fallback", exc_info=True)
        return _generate_fallback_tags(transcript)


def _parse_tags_response(response: str) -> list[str]:
    response = response.strip()
    json_match = re.search(r"\[.*?\]", response, re.DOTALL)
    if json_match:
        try:
            tags = json.loads(json_match.group())
            if isinstance(tags, list):
                return [str(tag).strip().strip('"\'""\'') for tag in tags if tag]
        except json.JSONDecodeError:
            logger.warning("[Enrichment] failed to parse tags JSON: %s", json_match.group())

    response = re.sub(r"^[\d\-\*\.]+\s*", "", response, flags=re.MULTILINE)
    parts = re.split(r"[,，、\n]+", response)
    tags = [part.strip().strip('"\'""\'') for part in parts if part.strip()]
    return tags or ["其他"]


def _generate_fallback_summary(transcript: str) -> str:
    normalized = transcript.strip()
    if not normalized:
        return "空内容"
    if len(normalized) <= 15:
        return normalized
    return normalized[:15] + "..."


def _generate_fallback_tags(transcript: str) -> list[str]:
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
    for keyword, tags in keyword_tags.items():
        if keyword in transcript:
            return tags
    return ["灵感", "想法"]
