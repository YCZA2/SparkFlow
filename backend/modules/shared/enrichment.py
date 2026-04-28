from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
import re
import time

from core.logging_config import get_logger
from modules.shared.ports import TextGenerationProvider
from modules.shared.prompt_loader import load_prompt_text, render_prompt_template
from modules.shared.fragment_snapshots import FRAGMENT_PURPOSES, normalize_fragment_purpose
from modules.shared.warning_throttle import WarningThrottle

logger = get_logger(__name__)
ENRICHMENT_WARNING_THROTTLE_SECONDS = 60.0
_enrichment_throttle = WarningThrottle(ENRICHMENT_WARNING_THROTTLE_SECONDS)

_ENRICHMENT_TAGS_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "enrichment_tags_system.txt"
_ENRICHMENT_TAGS_USER_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "enrichment_tags_user.txt"


@dataclass
class FragmentSemanticEnrichment:
    """描述后台对 fragment 自动生成的语义理解结果。"""

    summary: str | None
    system_tags: list[str]
    system_purpose: str


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


def build_fallback_fragment_semantics(transcript: str) -> FragmentSemanticEnrichment:
    """为异常场景提供本地可用的摘要、标签和用途。"""
    summary, tags = build_fallback_summary_and_tags(transcript)
    return FragmentSemanticEnrichment(
        summary=summary,
        system_tags=tags,
        system_purpose=_fallback_purpose(transcript),
    )


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


async def generate_fragment_semantics(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    timeout_seconds: float | None = None,
    body_html: str | None = None,
) -> FragmentSemanticEnrichment:
    """生成 fragment 摘要、系统标签和主要用途，并支持超时控制。"""
    if timeout_seconds is not None:
        return await asyncio.wait_for(
            _generate_fragment_semantics(
                transcript,
                llm_provider=llm_provider,
                body_html=body_html,
            ),
            timeout=timeout_seconds,
        )
    return await _generate_fragment_semantics(
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


async def _generate_fragment_semantics(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    body_html: str | None = None,
) -> FragmentSemanticEnrichment:
    """执行 fragment 语义增强流程。"""
    if not transcript or not transcript.strip():
        logger.warning("enrichment_empty_transcript")
        return FragmentSemanticEnrichment(summary="空内容", system_tags=["其他"], system_purpose="other")
    summary = await _generate_summary(transcript, llm_provider=llm_provider, body_html=body_html)
    tags = await _generate_tags(transcript, llm_provider=llm_provider)
    purpose = await _generate_purpose(transcript, llm_provider=llm_provider)
    return FragmentSemanticEnrichment(summary=summary, system_tags=tags, system_purpose=purpose)


async def _generate_summary(
    transcript: str,
    *,
    llm_provider: TextGenerationProvider,
    body_html: str | None = None,
) -> str:
    """从正文第一行提取摘要，不再使用 LLM。"""
    from modules.shared.content.body_service import extract_plain_text_from_html

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
    user_message = render_prompt_template(_ENRICHMENT_TAGS_USER_PROMPT_PATH, transcript=transcript)
    try:
        response = await llm_provider.generate(
            system_prompt=load_prompt_text(_ENRICHMENT_TAGS_SYSTEM_PROMPT_PATH),
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


async def _generate_purpose(transcript: str, *, llm_provider: TextGenerationProvider) -> str:
    """调用 LLM 生成稳定用途枚举，并在失败或非法输出时回退。"""
    purpose_prompt = (
        "你负责判断创作者素材碎片的主要用途。只返回 JSON，格式为 "
        '{"purpose":"content_material"}。purpose 必须是以下之一：'
        "content_material, style_reference, methodology, case_study, product_info, other。"
        "不要返回置信度。"
    )
    user_message = (
        "请判断下面碎片最主要的用途。"
        "内容素材用于写什么；风格参考只影响怎么写；方法论用于组织表达；"
        "案例用于举例支撑；产品资料用于具体事实信息；无法判断则 other。\n\n"
        f"{transcript[:3000]}"
    )
    try:
        response = await llm_provider.generate(
            system_prompt=purpose_prompt,
            user_message=user_message,
            temperature=0.1,
            max_tokens=80,
        )
        parsed = _parse_purpose_response(response)
        if parsed:
            return parsed
        return _fallback_purpose(transcript)
    except Exception as exc:
        _log_enrichment_failure(phase="purpose", exc=exc)
        return _fallback_purpose(transcript)


def _parse_purpose_response(response: str) -> str | None:
    """解析模型返回的用途 JSON 或裸枚举文本。"""
    normalized = str(response or "").strip()
    json_match = re.search(r"\{.*?\}", normalized, re.DOTALL)
    if json_match:
        try:
            payload = json.loads(json_match.group())
            if isinstance(payload, dict):
                return normalize_fragment_purpose(payload.get("purpose"))
        except json.JSONDecodeError:
            logger.warning("purpose_json_parse_failed", raw_purpose=json_match.group())
    for purpose in FRAGMENT_PURPOSES:
        if purpose in normalized:
            return purpose
    return None


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


def _fallback_purpose(transcript: str) -> str:
    """根据关键词生成无模型依赖的用途兜底。"""
    normalized = transcript.strip()
    if any(keyword in normalized for keyword in ["风格", "爆款", "口播稿", "参考脚本", "语气", "节奏"]):
        return "style_reference"
    if any(keyword in normalized for keyword in ["方法", "框架", "步骤", "模型", "公式", "SOP"]):
        return "methodology"
    if any(keyword in normalized for keyword in ["案例", "故事", "客户", "复盘", "经历"]):
        return "case_study"
    if any(keyword in normalized for keyword in ["产品", "价格", "功能", "卖点", "FAQ", "服务流程"]):
        return "product_info"
    return "content_material" if normalized else "other"
