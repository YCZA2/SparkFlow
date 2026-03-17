from __future__ import annotations

import asyncio
import json
import re
import time

from core.logging_config import get_logger
from modules.shared.ports import TextGenerationProvider
from modules.shared.warning_throttle import WarningThrottle

logger = get_logger(__name__)
ENRICHMENT_WARNING_THROTTLE_SECONDS = 60.0
_enrichment_throttle = WarningThrottle(ENRICHMENT_WARNING_THROTTLE_SECONDS)

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


def _log_enrichment_failure(*, phase: str, exc: Exception) -> None:
    """按阶段记录限频后的增强失败日志，避免重复刷完整堆栈。"""
    error_type = type(exc).__name__
    error_message = str(exc)
    current = time.monotonic()
    key = (phase, error_type, error_message)
    if _enrichment_throttle.should_emit(key, now=current):
        logger.warning(
            "enrichment_generation_failed",
            phase=phase,
            error_type=error_type,
            error=error_message,
        )
        return
    logger.debug(
        "enrichment_generation_failed_suppressed",
        phase=phase,
        error_type=error_type,
        error=error_message,
    )


def build_fallback_summary_and_tags(transcript: str) -> tuple[str, list[str]]:
    """为异常场景提供本地可用的摘要和标签降级结果。"""
    return (_generate_fallback_summary(transcript), _generate_fallback_tags(transcript))


async def generate_summary_and_tags(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    timeout_seconds: float | None = None,
    body_html: str | None = None,
) -> tuple[str, list[str]]:
    """生成摘要和标签，并支持超时控制。"""
    if timeout_seconds is not None:
        return await asyncio.wait_for(
            _generate_summary_and_tags(
                transcript,
                llm_provider=llm_provider,
                body_html=body_html,
            ),
            timeout=timeout_seconds,
        )
    return await _generate_summary_and_tags(
        transcript,
        llm_provider=llm_provider,
        body_html=body_html,
    )


async def _generate_summary_and_tags(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    body_html: str | None = None,
) -> tuple[str, list[str]]:
    """执行摘要和标签增强流程。"""
    if not transcript or not transcript.strip():
        logger.warning("enrichment_empty_transcript")
        return ("空内容", ["其他"])

    summary = await _generate_summary(
        transcript,
        llm_provider=llm_provider,
        body_html=body_html,
    )
    tags = await _generate_tags(transcript, llm_provider=llm_provider)
    return (summary, tags)


async def _generate_summary(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    body_html: str | None = None,
) -> str:
    """从正文第一行提取摘要，不再使用 LLM。"""
    from modules.shared.content.content_html import extract_plain_text_from_html

    # 优先从正文提取纯文本
    if body_html:
        plain_text = extract_plain_text_from_html(body_html)
    else:
        # 降级：使用 transcript（转写文本）
        plain_text = transcript.strip()

    if not plain_text:
        return "空内容"

    # 提取第一行
    first_line = plain_text.split('\n')[0].strip()

    # 截取前 20 字
    if len(first_line) <= 20:
        return first_line

    return first_line[:20] + "..."


async def _generate_tags(transcript: str, *, llm_provider: TextGenerationProvider) -> list[str]:
    """调用 LLM 生成标签，并在失败时回退。"""
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
    except Exception as exc:
        _log_enrichment_failure(phase="tags", exc=exc)
        return _generate_fallback_tags(transcript)


def _parse_tags_response(response: str) -> list[str]:
    """解析模型返回的标签列表或回退到文本分割。"""
    response = response.strip()
    json_match = re.search(r"\[.*?\]", response, re.DOTALL)
    if json_match:
        try:
            tags = json.loads(json_match.group())
            if isinstance(tags, list):
                return [str(tag).strip().strip('"\'""\'') for tag in tags if tag]
        except json.JSONDecodeError:
            logger.warning("tag_json_parse_failed", raw_tags=json_match.group())

    response = re.sub(r"^[\d\-\*\.]+\s*", "", response, flags=re.MULTILINE)
    parts = re.split(r"[,，、\n]+", response)
    tags = [part.strip().strip('"\'""\'') for part in parts if part.strip()]
    return tags or ["其他"]


def _generate_fallback_summary(transcript: str) -> str:
    """生成无模型依赖的兜底摘要。"""
    normalized = transcript.strip()
    if not normalized:
        return "空内容"
    if len(normalized) <= 15:
        return normalized
    return normalized[:15] + "..."


def _generate_fallback_tags(transcript: str) -> list[str]:
    """根据关键词生成无模型依赖的兜底标签。"""
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
