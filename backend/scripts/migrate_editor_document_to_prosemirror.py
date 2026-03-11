from __future__ import annotations

import json

from models import Fragment, SessionLocal
from modules.shared.editor_document import convert_legacy_editor_document, extract_plain_text_from_document, normalize_editor_document


def main() -> None:
    """批量把碎片正文迁移为 ProseMirror JSON，并同步纯文本快照。"""
    session = SessionLocal()
    migrated = 0
    skipped = 0
    try:
        fragments = session.query(Fragment).all()
        for fragment in fragments:
            raw_document = fragment.editor_document or {}
            if isinstance(raw_document, dict) and raw_document.get("type") == "doc" and "content" in raw_document:
                normalized = normalize_editor_document(raw_document)
            else:
                normalized = convert_legacy_editor_document(raw_document)
            before = json.dumps(raw_document, ensure_ascii=False, sort_keys=True)
            after = json.dumps(normalized, ensure_ascii=False, sort_keys=True)
            fragment.editor_document = normalized
            fragment.plain_text_snapshot = extract_plain_text_from_document(normalized)
            if before == after:
                skipped += 1
                continue
            migrated += 1
        session.commit()
    finally:
        session.close()
    print(f"migrated={migrated} skipped={skipped}")


if __name__ == "__main__":
    main()
