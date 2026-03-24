from __future__ import annotations

import re

from modules.shared.ports import KnowledgeChunk

_SENTENCE_END = re.compile(r"(?<=[。！？!?])\s*|\n{2,}")
_CHUNK_SIZE = 400
_OVERLAP_CHARS = 80


def build_knowledge_chunks(text: str) -> list[KnowledgeChunk]:
    """把知识库文本切成可索引的标准化分块。"""
    normalized = text.strip()
    if not normalized:
        return []

    sentences = [sentence.strip() for sentence in _SENTENCE_END.split(normalized) if sentence.strip()]
    if not sentences:
        return [KnowledgeChunk(chunk_index=0, content=normalized[:_CHUNK_SIZE])]

    chunks: list[KnowledgeChunk] = []
    current_parts: list[str] = []
    current_len = 0
    chunk_index = 0
    last_tail = ""

    for sentence in sentences:
        sentence_len = len(sentence)
        if sentence_len > _CHUNK_SIZE:
            if current_parts:
                chunk_text = (last_tail + "".join(current_parts)).strip()
                chunks.append(KnowledgeChunk(chunk_index=chunk_index, content=chunk_text))
                last_tail = chunk_text[-_OVERLAP_CHARS:] if len(chunk_text) > _OVERLAP_CHARS else chunk_text
                chunk_index += 1
                current_parts = []
                current_len = 0
            for start in range(0, sentence_len, _CHUNK_SIZE):
                fragment = sentence[start : start + _CHUNK_SIZE]
                chunks.append(KnowledgeChunk(chunk_index=chunk_index, content=fragment))
                last_tail = fragment[-_OVERLAP_CHARS:]
                chunk_index += 1
            continue
        if current_len + sentence_len > _CHUNK_SIZE and current_parts:
            chunk_text = (last_tail + "".join(current_parts)).strip()
            chunks.append(KnowledgeChunk(chunk_index=chunk_index, content=chunk_text))
            last_tail = chunk_text[-_OVERLAP_CHARS:] if len(chunk_text) > _OVERLAP_CHARS else chunk_text
            chunk_index += 1
            current_parts = []
            current_len = 0
        current_parts.append(sentence)
        current_len += sentence_len

    if current_parts:
        chunk_text = (last_tail + "".join(current_parts)).strip()
        chunks.append(KnowledgeChunk(chunk_index=chunk_index, content=chunk_text))

    return [chunk for chunk in chunks if chunk.content]
