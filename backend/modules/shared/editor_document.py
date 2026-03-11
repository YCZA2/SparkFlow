from __future__ import annotations

from copy import deepcopy
from typing import Any

from core.exceptions import ValidationError


ALLOWED_BLOCK_TYPES = {"paragraph", "heading", "blockquote", "bullet_list", "ordered_list", "image"}
ALLOWED_MARKS = {"bold", "italic"}
EMPTY_EDITOR_DOCUMENT: dict[str, Any] = {"type": "doc", "blocks": []}


def empty_editor_document() -> dict[str, Any]:
    """返回稳定的空文档结构，避免直接复用可变默认值。"""
    return deepcopy(EMPTY_EDITOR_DOCUMENT)


def build_document_from_text(text: str, *, block_type: str = "paragraph") -> dict[str, Any]:
    """把纯文本快速包装成最小可用的富文本文档。"""
    normalized = text.strip()
    if not normalized:
        return empty_editor_document()
    return {
        "type": "doc",
        "blocks": [
            {
                "id": "block-1",
                "type": block_type,
                "children": [
                    {
                        "text": normalized,
                        "marks": [],
                    }
                ],
            }
        ],
    }


def normalize_editor_document(document: Any) -> dict[str, Any]:
    """校验并规整富文本文档结构，拒绝未知块和非法 mark。"""
    if document is None:
        return empty_editor_document()
    if not isinstance(document, dict):
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document": "必须是对象"})
    if document.get("type") != "doc":
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document.type": "必须是 doc"})
    raw_blocks = document.get("blocks")
    if raw_blocks is None:
        return empty_editor_document()
    if not isinstance(raw_blocks, list):
        raise ValidationError(message="正文文档格式无效", field_errors={"editor_document.blocks": "必须是数组"})

    normalized_blocks: list[dict[str, Any]] = []
    for index, raw_block in enumerate(raw_blocks):
        if not isinstance(raw_block, dict):
            raise ValidationError(message="正文块格式无效", field_errors={f"editor_document.blocks.{index}": "必须是对象"})
        block_type = str(raw_block.get("type") or "").strip()
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise ValidationError(
                message="正文块类型无效",
                field_errors={f"editor_document.blocks.{index}.type": f"仅支持 {', '.join(sorted(ALLOWED_BLOCK_TYPES))}"},
            )
        block_id = str(raw_block.get("id") or f"block-{index + 1}").strip() or f"block-{index + 1}"
        if block_type == "image":
            normalized_blocks.append(
                {
                    "id": block_id,
                    "type": "image",
                    "asset_id": str(raw_block.get("asset_id") or "").strip() or None,
                    "url": str(raw_block.get("url") or "").strip() or None,
                    "width": _coerce_int(raw_block.get("width")),
                    "height": _coerce_int(raw_block.get("height")),
                    "alt": str(raw_block.get("alt") or "").strip() or None,
                }
            )
            continue

        children = raw_block.get("children")
        if not isinstance(children, list):
            raise ValidationError(
                message="正文块格式无效",
                field_errors={f"editor_document.blocks.{index}.children": "必须是数组"},
            )
        normalized_children: list[dict[str, Any]] = []
        for child_index, raw_child in enumerate(children):
            if not isinstance(raw_child, dict):
                raise ValidationError(
                    message="正文文本片段格式无效",
                    field_errors={f"editor_document.blocks.{index}.children.{child_index}": "必须是对象"},
                )
            text = str(raw_child.get("text") or "")
            raw_marks = raw_child.get("marks") or []
            if not isinstance(raw_marks, list):
                raise ValidationError(
                    message="正文文本样式格式无效",
                    field_errors={f"editor_document.blocks.{index}.children.{child_index}.marks": "必须是数组"},
                )
            marks = []
            for raw_mark in raw_marks:
                normalized_mark = str(raw_mark or "").strip()
                if normalized_mark not in ALLOWED_MARKS:
                    raise ValidationError(
                        message="正文文本样式无效",
                        field_errors={
                            f"editor_document.blocks.{index}.children.{child_index}.marks": f"仅支持 {', '.join(sorted(ALLOWED_MARKS))}"
                        },
                    )
                if normalized_mark not in marks:
                    marks.append(normalized_mark)
            normalized_children.append({"text": text, "marks": marks})
        normalized_blocks.append({"id": block_id, "type": block_type, "children": normalized_children})
    return {"type": "doc", "blocks": normalized_blocks}


def extract_plain_text_from_document(document: dict[str, Any] | None) -> str:
    """从富文本文档中提取纯文本快照，用于检索、摘要和生成。"""
    if not document or not isinstance(document, dict):
        return ""
    parts: list[str] = []
    for block in document.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "image":
            alt = str(block.get("alt") or "").strip()
            if alt:
                parts.append(alt)
            continue
        children = block.get("children") or []
        text = "".join(str(item.get("text") or "") for item in children if isinstance(item, dict)).strip()
        if text:
            parts.append(text)
    return "\n".join(parts).strip()


def collect_asset_ids_from_document(document: dict[str, Any] | None) -> list[str]:
    """收集正文内嵌图片节点引用的素材 ID。"""
    if not document or not isinstance(document, dict):
        return []
    asset_ids: list[str] = []
    for block in document.get("blocks") or []:
        if not isinstance(block, dict) or block.get("type") != "image":
            continue
        asset_id = str(block.get("asset_id") or "").strip()
        if asset_id and asset_id not in asset_ids:
            asset_ids.append(asset_id)
    return asset_ids


def render_document_as_markdown(document: dict[str, Any] | None) -> str:
    """把富文本文档单向渲染为 Markdown 导出文本。"""
    if not document or not isinstance(document, dict):
        return ""
    rendered_blocks: list[str] = []
    for block in document.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "").strip()
        if block_type == "image":
            url = str(block.get("url") or "").strip()
            alt = str(block.get("alt") or "").strip()
            if url:
                rendered_blocks.append(f"![{alt}]({url})")
            continue
        text = "".join(_render_child_markdown(item) for item in block.get("children") or [] if isinstance(item, dict)).strip()
        if not text:
            continue
        if block_type == "heading":
            rendered_blocks.append(f"# {text}")
        elif block_type == "blockquote":
            rendered_blocks.append(f"> {text}")
        elif block_type == "bullet_list":
            rendered_blocks.append(f"- {text}")
        elif block_type == "ordered_list":
            rendered_blocks.append(f"1. {text}")
        else:
            rendered_blocks.append(text)
    return "\n\n".join(rendered_blocks).strip()


def apply_ai_patch(document: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """按后端返回的 patch 更新文档，保持移动端和服务端语义一致。"""
    normalized = normalize_editor_document(document)
    operation = str(patch.get("op") or "").strip()
    blocks = normalized.get("blocks") or []
    if operation == "prepend_heading":
        heading = normalize_editor_document({"type": "doc", "blocks": [patch.get("block")]}).get("blocks", [])
        return {"type": "doc", "blocks": heading + blocks}
    if operation == "insert_after_selection":
        insertion = normalize_editor_document({"type": "doc", "blocks": patch.get("blocks") or []}).get("blocks", [])
        target_block_id = str(patch.get("target_block_id") or "").strip()
        if not target_block_id:
            return {"type": "doc", "blocks": blocks + insertion}
        next_blocks: list[dict[str, Any]] = []
        inserted = False
        for block in blocks:
            next_blocks.append(block)
            if block.get("id") == target_block_id:
                next_blocks.extend(insertion)
                inserted = True
        if not inserted:
            next_blocks.extend(insertion)
        return {"type": "doc", "blocks": next_blocks}
    if operation == "replace_selection":
        target_block_id = str(patch.get("target_block_id") or "").strip()
        replacement_text = str(patch.get("replacement_text") or "")
        next_blocks: list[dict[str, Any]] = []
        for block in blocks:
            if block.get("id") != target_block_id:
                next_blocks.append(block)
                continue
            updated_block = deepcopy(block)
            if updated_block.get("type") == "image":
                next_blocks.append(updated_block)
                continue
            children = updated_block.get("children") or []
            if children:
                children[0]["text"] = replacement_text
                for index in range(1, len(children)):
                    children[index]["text"] = ""
            else:
                updated_block["children"] = [{"text": replacement_text, "marks": []}]
            next_blocks.append(updated_block)
        return {"type": "doc", "blocks": next_blocks}
    raise ValidationError(message="AI patch 无效", field_errors={"patch.op": "不支持的操作"})


def _render_child_markdown(child: dict[str, Any]) -> str:
    """把带 mark 的文本片段渲染为 Markdown 内联片段。"""
    text = str(child.get("text") or "")
    marks = child.get("marks") or []
    if "italic" in marks:
        text = f"*{text}*"
    if "bold" in marks:
        text = f"**{text}**"
    return text


def _coerce_int(value: Any) -> int | None:
    """把可选尺寸字段规整为整数。"""
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
