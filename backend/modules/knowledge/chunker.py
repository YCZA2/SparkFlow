"""
参考脚本分块工具。

按句子边界切分，每块 ~400 字，相邻块保留单句重叠以提升检索召回率。
"""

from __future__ import annotations

import re

# 句子结束标点（中英文）
_SENTENCE_END = re.compile(r"(?<=[。！？!?])\s*|\n{2,}")

# 每块目标字数上限
_CHUNK_SIZE = 400

# 重叠时保留的字符数（约一句）
_OVERLAP_CHARS = 80


def chunk_text(text: str) -> list[tuple[int, str]]:
    """把文本切分为带序号的块列表，供向量化写入。

    返回 [(chunk_index, chunk_text), ...]，保证每块非空且不超过 _CHUNK_SIZE 字。
    相邻块保留尾部 _OVERLAP_CHARS 字的重叠，减少语义断点处的检索漏召。
    """
    normalized = text.strip()
    if not normalized:
        return []

    # 按句子边界拆分原始文本
    sentences = [s.strip() for s in _SENTENCE_END.split(normalized) if s.strip()]
    if not sentences:
        return [(0, normalized[:_CHUNK_SIZE])]

    chunks: list[tuple[int, str]] = []
    current_parts: list[str] = []
    current_len = 0
    chunk_index = 0
    last_tail = ""  # 上一块末尾用于重叠的文本

    for sentence in sentences:
        sentence_len = len(sentence)

        # 单句超长：直接截断写入
        if sentence_len > _CHUNK_SIZE:
            # 先把已有积累刷出
            if current_parts:
                chunk_text_str = last_tail + " ".join(current_parts)
                chunks.append((chunk_index, chunk_text_str.strip()))
                last_tail = chunk_text_str[-_OVERLAP_CHARS:] if len(chunk_text_str) > _OVERLAP_CHARS else chunk_text_str
                chunk_index += 1
                current_parts = []
                current_len = 0
            # 截断长句写入
            for start in range(0, sentence_len, _CHUNK_SIZE):
                fragment = sentence[start : start + _CHUNK_SIZE]
                chunks.append((chunk_index, fragment))
                last_tail = fragment[-_OVERLAP_CHARS:]
                chunk_index += 1
            continue

        # 加上本句后超出上限：先刷出当前块
        if current_len + sentence_len > _CHUNK_SIZE and current_parts:
            chunk_text_str = last_tail + " ".join(current_parts)
            chunks.append((chunk_index, chunk_text_str.strip()))
            last_tail = chunk_text_str[-_OVERLAP_CHARS:] if len(chunk_text_str) > _OVERLAP_CHARS else chunk_text_str
            chunk_index += 1
            current_parts = []
            current_len = 0

        current_parts.append(sentence)
        current_len += sentence_len

    # 写出剩余句子
    if current_parts:
        chunk_text_str = last_tail + " ".join(current_parts)
        chunks.append((chunk_index, chunk_text_str.strip()))

    return [(i, c) for i, c in chunks if c]
