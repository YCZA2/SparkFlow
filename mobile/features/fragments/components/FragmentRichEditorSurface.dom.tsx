import React, { forwardRef, useEffect, useRef } from 'react';
import { useDOMImperativeHandle } from 'expo/dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

import type {
  EditorDocument,
  EditorNode,
  EditorSelectionRange,
  FragmentAiPatch,
} from '@/types/fragment';

import type { FragmentRichEditorHandle } from './FragmentRichEditor';

interface SelectionPayload {
  range: EditorSelectionRange | null;
  text: string;
}

interface FragmentRichEditorSurfaceProps {
  document: EditorDocument;
  onReady?: () => void;
  onDocumentChange?: (document: EditorDocument) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
  dom?: {
    matchContents?: boolean;
    style?: unknown;
  };
}

function normalizeDocument(document: EditorDocument): EditorDocument {
  /** 中文注释：在 DOM 编辑器内兜底标准文档结构，避免 setContent 时报错。 */
  return document?.type === 'doc' && Array.isArray(document.content)
    ? document
    : { type: 'doc', content: [] };
}

const FragmentRichEditorSurface = forwardRef<FragmentRichEditorHandle, FragmentRichEditorSurfaceProps>(function FragmentRichEditorSurface({
  document,
  onReady,
  onDocumentChange,
  onSelectionChange,
  dom: _dom,
}, ref) {
  /** 中文注释：在 DOM 侧挂载 Tiptap，并通过 imperative handle 暴露桥接命令。 */
  const lastSerializedDocumentRef = useRef('');
  const lastSelectionRef = useRef('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1] },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: normalizeDocument(document) as any,
    editorProps: {
      attributes: {
        class: 'sparkflow-editor',
      },
    },
    onCreate: ({ editor }) => {
      lastSerializedDocumentRef.current = JSON.stringify(editor.getJSON());
      onReady?.();
      emitSelection(editor);
    },
    onUpdate: ({ editor }) => {
      const nextDocument = editor.getJSON() as EditorDocument;
      const serialized = JSON.stringify(nextDocument);
      if (serialized === lastSerializedDocumentRef.current) return;
      lastSerializedDocumentRef.current = serialized;
      onDocumentChange?.(nextDocument);
    },
    onSelectionUpdate: ({ editor }) => {
      emitSelection(editor);
    },
  });

  function emitSelection(currentEditor: NonNullable<typeof editor>): void {
    /** 中文注释：把当前选区位置和文本同步回原生层。 */
    const { from, to } = currentEditor.state.selection;
    const text = currentEditor.state.doc.textBetween(from, to, '\n', '\n');
    const serialized = JSON.stringify({ from, to, text });
    if (serialized === lastSelectionRef.current) return;
    lastSelectionRef.current = serialized;
    onSelectionChange?.({
      range: { from, to },
      text,
    });
  }

  useEffect(() => {
    /** 中文注释：当原生层文档变化时回灌到 Tiptap，避免本地草稿或远端更新失真。 */
    if (!editor) return;
    const nextDocument = normalizeDocument(document);
    const serialized = JSON.stringify(nextDocument);
    if (serialized === lastSerializedDocumentRef.current) return;
    lastSerializedDocumentRef.current = serialized;
    editor.commands.setContent(nextDocument as any, { emitUpdate: false });
    emitSelection(editor);
  }, [document, editor]);

  useDOMImperativeHandle<FragmentRichEditorHandle>(ref, () => ({
    setDocument(nextDocument: EditorDocument) {
      if (!editor) return;
      const normalized = normalizeDocument(nextDocument);
      lastSerializedDocumentRef.current = JSON.stringify(normalized);
      editor.commands.setContent(normalized as any, { emitUpdate: false });
      emitSelection(editor);
    },
    focus() {
      editor?.commands.focus();
    },
    insertImage(node: EditorNode) {
      if (!editor) return;
      const attrs = {
        src: String(node.attrs?.src ?? ''),
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : undefined,
        assetId: typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : undefined,
        width: typeof node.attrs?.width === 'number' ? node.attrs.width : undefined,
        height: typeof node.attrs?.height === 'number' ? node.attrs.height : undefined,
      };
      if (!attrs.src) return;
      editor.chain().focus().setImage(attrs as any).run();
    },
    applyPatch(patch: FragmentAiPatch) {
      if (!editor) return;
      if (patch.op === 'prepend_heading' && patch.block) {
        editor.commands.insertContentAt(0, patch.block as any);
        return;
      }
      if (patch.op === 'insert_block_after_range') {
        const target = patch.range?.to ?? editor.state.selection.to;
        editor.commands.insertContentAt(target, (patch.blocks ?? []) as any);
        return;
      }
      if (patch.op === 'replace_range') {
        const from = patch.range?.from ?? editor.state.selection.from;
        const to = patch.range?.to ?? editor.state.selection.to;
        editor.commands.insertContentAt({ from, to }, patch.text ?? '');
      }
    },
  }), [editor]);

  if (!editor) {
    return <div style={styles.loading}>正在加载编辑器...</div>;
  }

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <ToolbarButton label="段落" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
        <ToolbarButton label="标题" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton label="无序" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="有序" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      </div>
      <EditorContent editor={editor} />
      <style>{cssText}</style>
    </div>
  );
});

function ToolbarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  /** 中文注释：渲染 DOM 内部格式工具栏按钮。 */
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.button,
        ...(active ? styles.buttonActive : null),
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: 320,
    backgroundColor: '#F7F8F7',
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    padding: '12px 12px 0',
    borderBottom: '1px solid #E0E4DD',
    backgroundColor: '#F7F8F7',
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  button: {
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#2B332D',
    backgroundColor: '#E6EAE3',
    cursor: 'pointer',
  },
  buttonActive: {
    color: '#FFFFFF',
    backgroundColor: '#2C8C63',
  },
  loading: {
    minHeight: 320,
    padding: 16,
    color: '#526156',
    fontSize: 14,
  },
};

const cssText = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #F7F8F7; color: #1F2922; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif; }
  .ProseMirror {
    min-height: 260px;
    padding: 16px 16px 24px;
    outline: none;
    font-size: 16px;
    line-height: 1.7;
    color: #1F2922;
  }
  .ProseMirror p { margin: 0 0 12px; }
  .ProseMirror h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.25; }
  .ProseMirror blockquote {
    margin: 0 0 12px;
    padding-left: 14px;
    border-left: 3px solid #86A68F;
    color: #526156;
  }
  .ProseMirror ul, .ProseMirror ol {
    margin: 0 0 12px;
    padding-left: 24px;
  }
  .ProseMirror img {
    max-width: 100%;
    border-radius: 12px;
    display: block;
    margin: 12px 0;
  }
`;

export default FragmentRichEditorSurface;
