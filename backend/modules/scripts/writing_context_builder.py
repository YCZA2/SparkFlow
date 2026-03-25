"""脚本生成三层写作上下文构建器。"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from domains.knowledge import repository as knowledge_repository
from domains.scripts import repository as script_repository
from domains.writing_context import repository as writing_context_repository
from models import User
from modules.shared.content.content_html import extract_plain_text_from_html
from modules.shared.fragment_snapshots import FragmentSnapshotReader, read_fragment_snapshot_text
from modules.shared.ports import KnowledgeIndexStore, TextGenerationProvider, VectorStore
from modules.shared.prompt_loader import load_prompt_text
from utils.serialization import parse_json_object_list

from .writing_context import MethodologyPayload, StableCorePayload, WritingContextBundle

_METHODOLOGY_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "methodology_distillation.txt"
_STABLE_CORE_PRESET_PATH = Path(__file__).parent.parent.parent / "prompts" / "stable_core_preset.txt"
_TOKEN_SPLIT_RE = re.compile(r"[\s,，。！？!?:：;；、\n\r\t]+")
_MAX_METHODOLOGY_FRAGMENT_SOURCES = 30
_MAX_RELATED_FRAGMENT_HITS = 3
_MAX_RELATED_KNOWLEDGE_HITS = 3
_MAX_RELATED_SCRIPT_HITS = 2
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


def _extract_json_block(text: str) -> str:
    """去掉可能存在的 Markdown 代码围栏。"""
    normalized = str(text or "").strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        inner_lines = lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:]
        normalized = "\n".join(inner_lines).strip()
    return normalized


def _normalize_text(text: str, *, limit: int = 600) -> str:
    """压缩文本长度，避免上下文过长。"""
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def _split_query_tokens(text: str) -> list[str]:
    """把主题拆成简单词项，用于相关素材粗排。"""
    tokens = [item.strip().lower() for item in _TOKEN_SPLIT_RE.split(text or "") if item.strip()]
    expanded: list[str] = []
    for token in tokens:
        expanded.append(token)
        if re.search(r"[\u4e00-\u9fff]", token) and len(token) > 4:
            for size in (2, 3, 4):
                for start in range(0, max(0, len(token) - size + 1)):
                    expanded.append(token[start : start + size])
    unique_tokens: list[str] = []
    for token in expanded:
        if len(token) <= 1:
            continue
        if token not in unique_tokens:
            unique_tokens.append(token)
    return unique_tokens[:12]


def _score_text_against_tokens(text: str, tokens: list[str]) -> float:
    """按词项重合度对候选文本做轻量打分。"""
    haystack = str(text or "").lower()
    if not haystack or not tokens:
        return 0.0
    score = 0.0
    for token in tokens:
        if token in haystack:
            score += 1.0
    return score


def _build_source_signature(parts: list[str]) -> str:
    """把来源特征规整成可比较签名。"""
    digest = hashlib.sha256()
    digest.update("||".join(parts).encode("utf-8"))
    return digest.hexdigest()


def _preset_methodology_entries() -> list[MethodologyPayload]:
    """返回系统预置的方法论条目，当前默认留空以避免过度影响风格。"""
    return []


def _build_preset_stable_core() -> StableCorePayload:
    """返回当前阶段固定预置的稳定内核，不再按用户素材动态生成。"""
    return StableCorePayload(
        content=load_prompt_text(_STABLE_CORE_PRESET_PATH),
        source_summary="当前阶段使用系统预置稳定内核。",
    )


def _list_cached_fragment_methodology_entries(*, db: Session, user_id: str) -> list[MethodologyPayload]:
    """仅读取已落库的碎片方法论条目，不在生成链路中触发重算。"""
    existing_entries = writing_context_repository.list_methodology_entries_by_source_type(
        db=db,
        user_id=user_id,
        source_type="fragment_distilled",
    )
    return [
        MethodologyPayload(
            title=entry.title or "",
            content=entry.content,
            source_type=entry.source_type,
        )
        for entry in existing_entries
        if entry.enabled and entry.content.strip()
    ]


def _estimate_incremental_fragment_count(existing_entries: list[Any], current_fragment_ids: list[str]) -> int:
    """根据上次提炼时记录的来源碎片，估算本轮新增碎片数量。"""
    previous_ids: set[str] = set()
    for entry in existing_entries:
        if not getattr(entry, "source_ref_ids", None):
            continue
        try:
            previous_ids.update(str(item) for item in json.loads(entry.source_ref_ids) if str(item).strip())
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    if not previous_ids:
        return len(current_fragment_ids)
    return len([fragment_id for fragment_id in current_fragment_ids if fragment_id not in previous_ids])


async def _refresh_fragment_methodology_entries(
    *,
    db: Session,
    user_id: str,
    llm_provider: TextGenerationProvider,
) -> list[MethodologyPayload]:
    """在离线维护任务中按阈值重建自动提炼的方法论条目。"""
    eligible_fragments = _FRAGMENT_SNAPSHOT_READER.list_vectorizable_by_user(db=db, user_id=user_id)

    existing_entries = writing_context_repository.list_methodology_entries_by_source_type(
        db=db,
        user_id=user_id,
        source_type="fragment_distilled",
    )

    if not eligible_fragments:
        writing_context_repository.replace_methodology_entries_for_source(
            db=db,
            user_id=user_id,
            source_type="fragment_distilled",
            entries=[],
        )
        return []

    current_fragment_ids = [fragment.id for fragment in eligible_fragments[-_MAX_METHODOLOGY_FRAGMENT_SOURCES:]]
    if len(eligible_fragments) < settings.WRITING_CONTEXT_MIN_FRAGMENTS:
        return _list_cached_fragment_methodology_entries(db=db, user_id=user_id)

    source_signature = _build_source_signature(
        [f"{fragment.id}:{fragment.updated_at.isoformat()}:{len(read_fragment_snapshot_text(fragment))}" for fragment in eligible_fragments]
    )
    if existing_entries and all(entry.source_signature == source_signature for entry in existing_entries if entry.source_signature is not None):
        return _list_cached_fragment_methodology_entries(db=db, user_id=user_id)

    if existing_entries:
        incremental_count = _estimate_incremental_fragment_count(existing_entries, current_fragment_ids)
        if incremental_count < settings.WRITING_CONTEXT_MIN_INCREMENTAL_FRAGMENTS:
            return _list_cached_fragment_methodology_entries(db=db, user_id=user_id)

    source_text = "\n\n".join(
        f"[碎片] {_normalize_text(read_fragment_snapshot_text(fragment))}"
        for fragment in eligible_fragments[-_MAX_METHODOLOGY_FRAGMENT_SOURCES:]
    )
    raw = await llm_provider.generate(
        system_prompt=load_prompt_text(_METHODOLOGY_PROMPT_PATH),
        user_message=source_text,
        temperature=0.2,
        max_tokens=900,
    )
    parsed_entries = parse_json_object_list(_extract_json_block(raw))
    entries_payload: list[dict[str, str | bool | None]] = []
    for item in parsed_entries or []:
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        entries_payload.append(
            {
                "title": str(item.get("title") or "").strip() or None,
                "content": content,
                "source_ref_ids": json.dumps(current_fragment_ids, ensure_ascii=False),
                "source_signature": source_signature,
                "enabled": True,
            }
        )

    stored_entries = writing_context_repository.replace_methodology_entries_for_source(
        db=db,
        user_id=user_id,
        source_type="fragment_distilled",
        entries=entries_payload,
    )
    return [
        MethodologyPayload(
            title=entry.title or "",
            content=entry.content,
            source_type=entry.source_type,
        )
        for entry in stored_entries
        if entry.enabled and entry.content.strip()
    ]


async def refresh_fragment_methodology_entries_for_all_users(
    *,
    db: Session,
    llm_provider: TextGenerationProvider,
) -> dict[str, Any]:
    """每日遍历全部用户，按阈值静默刷新碎片方法论。"""
    user_ids = [row[0] for row in db.query(User.id).all()]
    refreshed_user_ids: list[str] = []
    skipped_user_ids: list[str] = []
    failed_user_ids: list[str] = []

    for user_id in user_ids:
        before_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=user_id,
            source_type="fragment_distilled",
        )
        before_signature = before_entries[0].source_signature if before_entries else None
        before_count = len(before_entries)
        try:
            refreshed_entries = await _refresh_fragment_methodology_entries(
                db=db,
                user_id=user_id,
                llm_provider=llm_provider,
            )
        except Exception:
            failed_user_ids.append(user_id)
            continue

        after_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=user_id,
            source_type="fragment_distilled",
        )
        after_signature = after_entries[0].source_signature if after_entries else None
        if after_signature != before_signature or (before_count == 0 and len(refreshed_entries) > 0):
            refreshed_user_ids.append(user_id)
        else:
            skipped_user_ids.append(user_id)

    return {
        "user_count": len(user_ids),
        "refreshed_user_ids": refreshed_user_ids,
        "skipped_user_ids": skipped_user_ids,
        "failed_user_ids": failed_user_ids,
    }


def _build_uploaded_methodology_entries(*, db: Session, user_id: str) -> list[MethodologyPayload]:
    """把上传知识资料映射成方法论条目。"""
    docs = knowledge_repository.list_by_user(db=db, user_id=user_id, doc_type=None, limit=200, offset=0)
    items: list[MethodologyPayload] = []
    for doc in docs:
        if doc.doc_type == "reference_script":
            continue
        content = _normalize_text(doc.content, limit=320)
        if not content:
            continue
        items.append(
            MethodologyPayload(
                title=doc.title,
                content=content,
                source_type="knowledge_upload",
            )
        )
    return items


def _build_related_scripts(*, db: Session, user_id: str, query_text: str) -> list[str]:
    """按主题粗排历史脚本，作为相关素材层的一部分。"""
    tokens = _split_query_tokens(query_text)
    if not tokens:
        return []
    candidates = script_repository.list_recent_by_user(db=db, user_id=user_id, limit=40)
    ranked: list[tuple[float, str]] = []
    for script in candidates:
        plain_text = extract_plain_text_from_html(script.body_html)
        combined = "\n".join(part for part in [script.title or "", plain_text] if part).strip()
        score = _score_text_against_tokens(combined, tokens)
        if score <= 0:
            continue
        ranked.append((score, f"[历史脚本:{script.title or script.id}] {_normalize_text(plain_text, limit=360)}"))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [text for _, text in ranked[:_MAX_RELATED_SCRIPT_HITS]]


async def _build_related_fragments(
    *,
    db: Session,
    user_id: str,
    query_text: str,
    vector_store: VectorStore,
    exclude_fragment_ids: list[str],
) -> list[str]:
    """按主题召回相关碎片，并读取正文内容。"""
    hits = await vector_store.query_fragments(
        user_id=user_id,
        query_text=query_text,
        top_k=_MAX_RELATED_FRAGMENT_HITS,
        exclude_ids=exclude_fragment_ids,
    )
    fragment_ids = [str(item.get("fragment_id") or "") for item in hits if str(item.get("fragment_id") or "").strip()]
    fragments = _FRAGMENT_SNAPSHOT_READER.get_by_ids(db=db, user_id=user_id, fragment_ids=fragment_ids)
    fragment_map = {fragment.id: fragment for fragment in fragments}
    items: list[str] = []
    for fragment_id in fragment_ids:
        fragment = fragment_map.get(fragment_id)
        if not fragment:
            continue
        content = read_fragment_snapshot_text(fragment)
        if content:
            items.append(f"[相关碎片] {_normalize_text(content, limit=280)}")
    return items


async def _build_related_knowledge(
    *,
    user_id: str,
    query_text: str,
    knowledge_index_store: KnowledgeIndexStore,
) -> list[str]:
    """按主题召回相关知识文档内容。"""
    hits = await knowledge_index_store.search(
        user_id=user_id,
        query_text=query_text,
        top_k=_MAX_RELATED_KNOWLEDGE_HITS,
    )
    items: list[str] = []
    for hit in hits:
        content = ((hit.matched_chunks or [""])[0] or "").strip()
        if not content:
            continue
        items.append(f"[相关知识:{hit.title}] {_normalize_text(content, limit=320)}")
    return items


async def build_writing_context_bundle(
    *,
    db: Session,
    user_id: str,
    query_text: str,
    llm_provider: TextGenerationProvider,
    vector_store: VectorStore,
    knowledge_index_store: KnowledgeIndexStore,
    exclude_fragment_ids: list[str] | None = None,
) -> WritingContextBundle:
    """构建脚本生成所需的三层写作上下文。"""
    stable_core = _build_preset_stable_core()
    methodologies = _list_cached_fragment_methodology_entries(db=db, user_id=user_id)
    methodologies.extend(_build_uploaded_methodology_entries(db=db, user_id=user_id))
    methodologies.extend(_preset_methodology_entries())

    unique_methodologies: list[MethodologyPayload] = []
    seen_payloads: set[tuple[str, str]] = set()
    for item in methodologies:
        key = (item.title.strip(), item.content.strip())
        if not item.content.strip() or key in seen_payloads:
            continue
        seen_payloads.add(key)
        unique_methodologies.append(item)

    related_scripts = _build_related_scripts(db=db, user_id=user_id, query_text=query_text)
    related_fragments = await _build_related_fragments(
        db=db,
        user_id=user_id,
        query_text=query_text,
        vector_store=vector_store,
        exclude_fragment_ids=exclude_fragment_ids or [],
    )
    related_knowledge = await _build_related_knowledge(
        user_id=user_id,
        query_text=query_text,
        knowledge_index_store=knowledge_index_store,
    )

    return WritingContextBundle(
        stable_core=stable_core,
        methodologies=unique_methodologies,
        related_scripts=related_scripts,
        related_fragments=related_fragments,
        related_knowledge=related_knowledge,
    )
