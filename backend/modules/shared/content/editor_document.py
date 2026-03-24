from __future__ import annotations

from copy import deepcopy
from typing import Any

from core.exceptions import ValidationError


ALLOWED_NODE_TYPES = {"doc", "paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem", "text", "image"}
ALLOWED_MARKS = {"bold", "italic"}
EMPTY_EDITOR_DOCUMENT: dict[str, Any] = {"type": "doc", "content": []}


def empty_editor_document() -> dict[str, Any]:
    """返回稳定的空 ProseMirror 文档。"""
    return deepcopy(EMPTY_EDITOR_DOCUMENT)


def build_document_from_text(text: str, *, block_type: str = "paragraph") -> dict[str, Any]:
    """把纯文本包装成最小可用的 ProseMirror 文档。"""
    normalized = text.strip()
    if not normalized:
        return empty_editor_document()
    if block_type == "heading":
        return {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": normalized}],
                }
            ],
        }
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": normalized}],
            }
        ],
    }


def normalize_editor_document(document: Any) -> dict[str, Any]:
    """校验并规整 ProseMirror 文档，同时兜底迁移旧结构。"""
    if document is None:
        return empty_editor_document()
    if not isinstance(document, dict):
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document": "必须是对象"})
    if document.get("type") != "doc":
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document.type": "必须是 doc"})
    raw_content = document.get("content")
    if raw_content is None and isinstance(document.get("blocks"), list):
        legacy_blocks = document.get("blocks") or []
        normalized_blocks = [
            _build_inline_container_from_legacy_block(block)
            for block in legacy_blocks
            if isinstance(block, dict)
        ]
        return {"type": "doc", "content": normalized_blocks}
    if raw_content is None:
        return empty_editor_document()
    if not isinstance(raw_content, list):
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document.content": "必须是数组"})
    return {"type": "doc", "content": [_normalize_node(node, path=f"editor_document.content.{index}") for index, node in enumerate(raw_content)]}


def extract_plain_text_from_document(document: dict[str, Any] | None) -> str:
    """递归提取正文纯文本，供检索、摘要和生成复用。"""
    normalized = normalize_editor_document(document)
    blocks = [_extract_node_plain_text(node).strip() for node in normalized.get("content", [])]
    return "\n".join([block for block in blocks if block]).strip()


def collect_asset_ids_from_document(document: dict[str, Any] | None) -> list[str]:
    """递归收集正文图片节点引用的素材 ID。"""
    normalized = normalize_editor_document(document)
    asset_ids: list[str] = []
    for node in normalized.get("content", []):
        _collect_asset_ids(node, asset_ids)
    return asset_ids


def render_document_as_markdown(document: dict[str, Any] | None) -> str:
    """把 ProseMirror 文档单向渲染为 Markdown 导出文本。"""
    normalized = normalize_editor_document(document)
    rendered = [_render_block_markdown(node, ordered_index=None).strip() for node in normalized.get("content", [])]
    return "\n\n".join([item for item in rendered if item]).strip()


def apply_ai_patch(document: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """按 AI patch 更新文档，供服务端和测试复用。"""
    normalized = normalize_editor_document(document)
    operation = str(patch.get("op") or "").strip()
    content = deepcopy(normalized.get("content", []))
    if operation == "prepend_heading":
        heading = _normalize_node(patch.get("block") or {}, path="patch.block")
        return {"type": "doc", "content": [heading, *content]}
    if operation == "insert_block_after_range":
        insertion = normalize_editor_document({"type": "doc", "content": patch.get("blocks") or []}).get("content", [])
        insert_after = _coerce_position((patch.get("range") or {}).get("to"))
        if insert_after is None:
            return {"type": "doc", "content": [*content, *insertion]}
        return {"type": "doc", "content": _insert_blocks_after_position(content, insertion, insert_after)}
    if operation == "replace_range":
        selection_range = patch.get("range") or {}
        start = _coerce_position(selection_range.get("from"))
        end = _coerce_position(selection_range.get("to"))
        replacement_text = str(patch.get("text") or "")
        if start is None or end is None:
            return build_document_from_text(replacement_text)
        return {"type": "doc", "content": _replace_text_range(content, start, end, replacement_text)}
    raise ValidationError(message="AI patch 无效", field_errors={"patch.op": "不支持的操作"})


def _normalize_node(node: Any, *, path: str) -> dict[str, Any]:
    """递归校验单个 ProseMirror 节点。"""
    if not isinstance(node, dict):
        raise ValidationError(message="正文节点格式无效", field_errors={path: "必须是对象"})
    node_type = str(node.get("type") or "").strip()
    if node_type not in ALLOWED_NODE_TYPES:
        raise ValidationError(message="正文节点类型无效", field_errors={f"{path}.type": f"仅支持 {', '.join(sorted(ALLOWED_NODE_TYPES))}"})
    if node_type == "text":
        return _normalize_text_node(node, path=path)
    normalized: dict[str, Any] = {"type": node_type}
    attrs = _normalize_attrs(node_type=node_type, raw_attrs=node.get("attrs"), path=f"{path}.attrs")
    if attrs is not None:
        normalized["attrs"] = attrs
    raw_content = node.get("content")
    if raw_content is None:
        if node_type in {"paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem", "doc"}:
            normalized["content"] = []
        return normalized
    if not isinstance(raw_content, list):
        raise ValidationError(message="正文节点内容无效", field_errors={f"{path}.content": "必须是数组"})
    normalized["content"] = [_normalize_node(item, path=f"{path}.content.{index}") for index, item in enumerate(raw_content)]
    _validate_node_children(node_type=node_type, content=normalized["content"], path=path)
    return normalized


def _normalize_text_node(node: dict[str, Any], *, path: str) -> dict[str, Any]:
    """规整文本节点和样式 mark。"""
    text = str(node.get("text") or "")
    normalized: dict[str, Any] = {"type": "text", "text": text}
    raw_marks = node.get("marks") or []
    if raw_marks:
        if not isinstance(raw_marks, list):
            raise ValidationError(message="正文文本样式无效", field_errors={f"{path}.marks": "必须是数组"})
        marks: list[dict[str, Any]] = []
        seen: set[str] = set()
        for index, mark in enumerate(raw_marks):
            if not isinstance(mark, dict):
                raise ValidationError(message="正文文本样式无效", field_errors={f"{path}.marks.{index}": "必须是对象"})
            mark_type = str(mark.get("type") or "").strip()
            if mark_type not in ALLOWED_MARKS:
                raise ValidationError(message="正文文本样式无效", field_errors={f"{path}.marks.{index}.type": f"仅支持 {', '.join(sorted(ALLOWED_MARKS))}"})
            if mark_type in seen:
                continue
            seen.add(mark_type)
            marks.append({"type": mark_type})
        if marks:
            normalized["marks"] = marks
    return normalized


def _normalize_attrs(*, node_type: str, raw_attrs: Any, path: str) -> dict[str, Any] | None:
    """规整节点 attrs，仅保留当前协议用到的字段。"""
    if raw_attrs is None:
        if node_type == "heading":
            return {"level": 1}
        return None
    if not isinstance(raw_attrs, dict):
        raise ValidationError(message="正文节点属性无效", field_errors={path: "必须是对象"})
    if node_type == "heading":
        level = raw_attrs.get("level", 1)
        try:
            normalized_level = int(level)
        except (TypeError, ValueError):
            normalized_level = 1
        return {"level": max(1, min(6, normalized_level))}
    if node_type == "image":
        return {
            "src": str(raw_attrs.get("src") or "").strip() or None,
            "alt": str(raw_attrs.get("alt") or "").strip() or None,
            "assetId": str(raw_attrs.get("assetId") or "").strip() or None,
            "width": _coerce_int(raw_attrs.get("width")),
            "height": _coerce_int(raw_attrs.get("height")),
        }
    return None


def _validate_node_children(*, node_type: str, content: list[dict[str, Any]], path: str) -> None:
    """约束最小节点树形结构，避免无效组合落库。"""
    if node_type == "doc":
        for index, child in enumerate(content):
            if child["type"] not in {"paragraph", "heading", "blockquote", "bulletList", "orderedList", "image"}:
                raise ValidationError(message="正文文档结构无效", field_errors={f"{path}.content.{index}.type": "doc 下仅允许块级节点"})
    elif node_type in {"paragraph", "heading"}:
        for index, child in enumerate(content):
            if child["type"] not in {"text"}:
                raise ValidationError(message="正文文档结构无效", field_errors={f"{path}.content.{index}.type": f"{node_type} 下仅允许 text"})
    elif node_type == "blockquote":
        for index, child in enumerate(content):
            if child["type"] not in {"paragraph"}:
                raise ValidationError(message="正文文档结构无效", field_errors={f"{path}.content.{index}.type": "blockquote 下仅允许 paragraph"})
    elif node_type in {"bulletList", "orderedList"}:
        for index, child in enumerate(content):
            if child["type"] != "listItem":
                raise ValidationError(message="正文文档结构无效", field_errors={f"{path}.content.{index}.type": f"{node_type} 下仅允许 listItem"})
    elif node_type == "listItem":
        for index, child in enumerate(content):
            if child["type"] != "paragraph":
                raise ValidationError(message="正文文档结构无效", field_errors={f"{path}.content.{index}.type": "listItem 下仅允许 paragraph"})


def _build_inline_container_from_legacy_block(raw_block: dict[str, Any]) -> dict[str, Any]:
    """把旧文本块转换为 paragraph 节点。"""
    children = raw_block.get("children")
    content: list[dict[str, Any]] = []
    if isinstance(children, list):
        for child in children:
            if not isinstance(child, dict):
                continue
            text = str(child.get("text") or "")
            if not text:
                continue
            marks = []
            for raw_mark in child.get("marks") or []:
                mark_type = str(raw_mark or "").strip()
                if mark_type in ALLOWED_MARKS:
                    marks.append({"type": mark_type})
            content.append({"type": "text", "text": text, "marks": marks} if marks else {"type": "text", "text": text})
    if not content:
        content = [{"type": "text", "text": ""}]
    return {"type": "paragraph", "content": content}


def _extract_node_plain_text(node: dict[str, Any]) -> str:
    """递归提取单个节点的纯文本。"""
    node_type = node.get("type")
    if node_type == "text":
        return str(node.get("text") or "")
    if node_type == "image":
        return str(((node.get("attrs") or {}).get("alt")) or "").strip()
    parts = [_extract_node_plain_text(child) for child in node.get("content", [])]
    if node_type in {"bulletList", "orderedList"}:
        return "\n".join(part for part in parts if part.strip())
    return "".join(parts)


def _collect_asset_ids(node: dict[str, Any], asset_ids: list[str]) -> None:
    """递归收集图片节点素材 ID。"""
    if node.get("type") == "image":
        asset_id = str(((node.get("attrs") or {}).get("assetId")) or "").strip()
        if asset_id and asset_id not in asset_ids:
            asset_ids.append(asset_id)
        return
    for child in node.get("content", []):
        _collect_asset_ids(child, asset_ids)


def _render_block_markdown(node: dict[str, Any], *, ordered_index: int | None) -> str:
    """按节点类型渲染 Markdown 片段。"""
    node_type = node.get("type")
    if node_type == "paragraph":
        return _render_inline_markdown(node.get("content", []))
    if node_type == "heading":
        level = int(((node.get("attrs") or {}).get("level")) or 1)
        return f"{'#' * max(1, min(6, level))} {_render_inline_markdown(node.get('content', []))}".strip()
    if node_type == "blockquote":
        text = "\n".join(line for line in [_render_block_markdown(child, ordered_index=None) for child in node.get("content", [])] if line)
        return "\n".join(f"> {line}" for line in text.splitlines() if line)
    if node_type == "bulletList":
        lines = []
        for item in node.get("content", []):
            rendered = _render_block_markdown(item, ordered_index=None).strip()
            if rendered:
                lines.append(f"- {rendered}")
        return "\n".join(lines)
    if node_type == "orderedList":
        lines = []
        for index, item in enumerate(node.get("content", []), start=1):
            rendered = _render_block_markdown(item, ordered_index=index).strip()
            if rendered:
                lines.append(f"{index}. {rendered}")
        return "\n".join(lines)
    if node_type == "listItem":
        parts = [_render_block_markdown(child, ordered_index=ordered_index) for child in node.get("content", [])]
        return "\n".join(part for part in parts if part.strip())
    if node_type == "image":
        attrs = node.get("attrs") or {}
        src = str(attrs.get("src") or "").strip()
        alt = str(attrs.get("alt") or "").strip()
        return f"![{alt}]({src})" if src else ""
    return ""


def _render_inline_markdown(content: list[dict[str, Any]]) -> str:
    """把一组 inline text 节点渲染成 Markdown。"""
    parts: list[str] = []
    for child in content:
        if child.get("type") != "text":
            continue
        text = str(child.get("text") or "")
        marks = [str(mark.get("type") or "") for mark in child.get("marks", []) if isinstance(mark, dict)]
        if "italic" in marks:
            text = f"*{text}*"
        if "bold" in marks:
            text = f"**{text}**"
        parts.append(text)
    return "".join(parts).strip()


def _replace_text_range(content: list[dict[str, Any]], start: int, end: int, replacement_text: str) -> list[dict[str, Any]]:
    """按 ProseMirror 文本位置范围替换正文文本。"""
    mutable = deepcopy(content)
    positions = _collect_text_positions(mutable)
    if not positions:
        return build_document_from_text(replacement_text).get("content", [])
    for item in positions:
        text = str(item["node"].get("text") or "")
        node_start = item["start"]
        node_end = item["end"]
        if end <= node_start or start >= node_end:
            continue
        left_keep = max(0, start - node_start)
        right_keep = max(0, node_end - end)
        left_text = text[:left_keep]
        right_text = text[len(text) - right_keep :] if right_keep else ""
        if node_start <= start < node_end:
            item["node"]["text"] = left_text + replacement_text + right_text
            replacement_text = ""
        else:
            item["node"]["text"] = left_text + right_text
    return mutable


def _insert_blocks_after_position(content: list[dict[str, Any]], insertion: list[dict[str, Any]], position: int) -> list[dict[str, Any]]:
    """按文本位置把块插入到最近的块节点之后。"""
    next_content: list[dict[str, Any]] = []
    inserted = False
    cursor = 1
    for node in content:
        next_content.append(node)
        node_size = _estimate_node_size(node)
        if not inserted and position <= cursor + node_size:
            next_content.extend(insertion)
            inserted = True
        cursor += node_size
    if not inserted:
        next_content.extend(insertion)
    return next_content


def _collect_text_positions(content: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """扁平化文本节点并记录 ProseMirror 样式的位置区间。"""
    positions: list[dict[str, Any]] = []
    cursor = 1

    def walk(node: dict[str, Any]) -> None:
        nonlocal cursor
        node_type = node.get("type")
        if node_type == "text":
            text = str(node.get("text") or "")
            positions.append({"node": node, "start": cursor, "end": cursor + len(text)})
            cursor += len(text)
            return
        cursor += 1
        for child in node.get("content", []):
            walk(child)
        cursor += 1

    for block in content:
        walk(block)
    return positions


def _estimate_node_size(node: dict[str, Any]) -> int:
    """粗略估算节点的 ProseMirror 位置跨度，用于块插入定位。"""
    if node.get("type") == "text":
        return len(str(node.get("text") or ""))
    return 2 + sum(_estimate_node_size(child) for child in node.get("content", []))


def _coerce_int(value: Any) -> int | None:
    """把可选尺寸字段规整为整数。"""
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_position(value: Any) -> int | None:
    """把选区位置规整为正整数。"""
    if value in (None, ""):
        return None
    try:
        position = int(value)
    except (TypeError, ValueError):
        return None
    return position if position >= 0 else None
