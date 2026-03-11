'use dom';

import React, { useEffect, useRef, useMemo } from 'react';
import { useDOMImperativeHandle, type DOMProps } from 'expo/dom';
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
import type { AppTheme } from '@/theme/tokens';

import {
  normalizeDocument,
  isEditorDocument,
  toTiptapDocument,
  toTiptapContent,
} from '@/components/editor/types/editorTypes';

import {
  createEditorCssVars,
  createEditorBaseCss,
  createToolbarButtonCss,
} from '@/components/editor/styles/editorTheme';

interface SelectionPayload {
  range: EditorSelectionRange | null;
  text: string;
}

interface FragmentRichEditorDomProps {
  ref?: React.Ref<FragmentRichEditorHandle>;
  dom?: DOMProps;
  document: EditorDocument;
  theme: AppTheme;
  onReady?: () => void;
  onDocumentChange?: (document: EditorDocument) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
}

export default function FragmentRichEditorDom({
  ref,
  document,
  theme,
  onReady,
  onDocumentChange,
  onSelectionChange,
}: FragmentRichEditorDomProps) {
  /** 中文注释：在 DOM 侧挂载 Tiptap，并通过 imperative handle 暴露桥接命令。 */
  const lastSerializedDocumentRef = useRef('');
  const lastSelectionRef = useRef('');

  // 中文注释：使用类型安全的方式规范化文档，并转换为 Tiptap 兼容格式
  const tiptapDocument = useMemo(() => toTiptapDocument(normalizeDocument(document)), [document]);

  // 中文注释：生成 CSS 变量和样式
  const cssVars = useMemo(() => createEditorCssVars(theme), [theme]);
  const baseCss = useMemo(() => createEditorBaseCss(), []);
  const toolbarCss = useMemo(() => createToolbarButtonCss(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1] },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: tiptapDocument,
    editorProps: {
      attributes: {
        class: 'sparkflow-editor',
      },
    },
    onCreate: ({ editor }) => {
      lastSerializedDocumentRef.current = serializeDocumentSnapshot(editor.getJSON());
      onReady?.();
      emitSelection(editor);
    },
    onUpdate: ({ editor }) => {
      const nextDocument = editor.getJSON();
      if (isEditorDocument(nextDocument)) {
        const serialized = serializeDocumentSnapshot(nextDocument);
        if (serialized === lastSerializedDocumentRef.current) return;
        lastSerializedDocumentRef.current = serialized;
        onDocumentChange?.(nextDocument);
      }
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
    const serialized = serializeDocumentSnapshot(document);
    if (serialized === lastSerializedDocumentRef.current) return;
    const nextDocument = toTiptapDocument(normalizeDocument(document));
    lastSerializedDocumentRef.current = serialized;
    editor.commands.setContent(nextDocument, { emitUpdate: false });
    emitSelection(editor);
  }, [document, editor]);

  useDOMImperativeHandle<FragmentRichEditorHandle>(ref ?? null, () => ({
    setDocument(nextDocument: EditorDocument) {
      if (!editor) return;
      const normalized = toTiptapDocument(normalizeDocument(nextDocument));
      lastSerializedDocumentRef.current = serializeDocumentSnapshot(nextDocument);
      editor.commands.setContent(normalized, { emitUpdate: false });
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
      editor.chain().focus().setImage(attrs).run();
    },
    applyPatch(patch: FragmentAiPatch) {
      if (!editor) return;
      if (patch.op === 'prepend_heading' && patch.block) {
        editor.commands.insertContentAt(0, toTiptapContent(patch.block));
        return;
      }
      if (patch.op === 'insert_block_after_range') {
        const target = patch.range?.to ?? editor.state.selection.to;
        const blocks = (patch.blocks ?? []).map(toTiptapContent);
        editor.commands.insertContentAt(target, blocks);
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
    return (
      <>
        <style>{`:root { ${cssVars} }`}</style>
        <div style={styles.loading}>正在加载编辑器...</div>
      </>
    );
  }

  return (
    <>
      <style>{`:root { ${cssVars} } ${baseCss} ${toolbarCss}`}</style>
      <div style={styles.root}>
        <div className="editor-toolbar">
          <ToolbarButton label="段落" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
          <ToolbarButton label="标题" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="无序" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="有序" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        </div>
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

function serializeDocumentSnapshot(document: EditorDocument | Record<string, unknown>): string {
  /** 中文注释：统一规整文档快照，避免 props 与 editor JSON 格式差异导致误判回灌。 */
  return JSON.stringify(normalizeDocument(document as EditorDocument));
}

function ToolbarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  /** 中文注释：渲染 DOM 内部格式工具栏按钮，使用 CSS 类名控制样式。 */
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'active' : undefined}
    >
      {label}
    </button>
  );
}

/**
 * 中文注释：仅保留布局相关样式，颜色由 CSS 变量控制。
 */
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: 320,
    background: 'var(--editor-background)',
  },
  loading: {
    minHeight: 320,
    padding: 16,
    color: 'var(--editor-text-muted)',
    fontSize: 14,
  },
};
