'use dom';

import React, { useEffect, useMemo, useRef } from 'react';
import { useDOMImperativeHandle, type DOMProps } from 'expo/dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import MarkdownIt from 'markdown-it';

import type {
  FragmentAiPatch,
  FragmentEditorCommand,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';

import type { FragmentRichEditorHandle } from './FragmentRichEditor';
import type { AppTheme } from '@/theme/tokens';

import {
  extractAssetIdsFromMarkdown,
  extractPlainTextFromMarkdown,
  normalizeBodyMarkdown,
} from '@/features/fragments/bodyMarkdown';
import {
  createEditorCssVars,
  createEditorBaseCss,
} from '@/components/editor/styles/editorTheme';

const SNAPSHOT_DEBOUNCE_MS = 180;

interface FragmentRichEditorDomProps {
  ref?: React.Ref<FragmentRichEditorHandle>;
  dom?: DOMProps;
  initialBodyMarkdown: string;
  mediaAssets: MediaAsset[];
  theme: AppTheme;
  onReady?: () => void;
  onSnapshotChange?: (snapshot: FragmentEditorSnapshot) => void;
  onSelectionChange?: (text: string) => void;
  onFormattingStateChange?: (state: FragmentEditorFormattingState) => void;
}

const SparkFlowImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-id'),
        renderHTML: (attributes) => (attributes.assetId ? { 'data-asset-id': attributes.assetId } : {}),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('data-width');
          return width ? Number(width) : null;
        },
        renderHTML: (attributes) => (attributes.width ? { 'data-width': String(attributes.width) } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute('data-height');
          return height ? Number(height) : null;
        },
        renderHTML: (attributes) => (attributes.height ? { 'data-height': String(attributes.height) } : {}),
      },
    };
  },
});

export default function FragmentRichEditorDom({
  ref,
  initialBodyMarkdown,
  mediaAssets,
  theme,
  onReady,
  onSnapshotChange,
  onSelectionChange,
  onFormattingStateChange,
}: FragmentRichEditorDomProps) {
  /*在 DOM 侧维护编辑器唯一 live state，并只向原生层发节流后的 Markdown 快照。 */
  const snapshotTimerRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef<string>('');
  const lastSelectionRef = useRef('');
  const lastToolbarStateRef = useRef('');
  const latestSnapshotRef = useRef<FragmentEditorSnapshot | null>(null);

  const markdownRenderer = useMemo(() => createMarkdownRenderer(mediaAssets), [mediaAssets]);
  const initialHtml = useMemo(
    () => markdownRenderer.render(normalizeBodyMarkdown(initialBodyMarkdown)),
    [initialBodyMarkdown, markdownRenderer]
  );

  const cssVars = useMemo(() => createEditorCssVars(theme), [theme]);
  const baseCss = useMemo(() => createEditorBaseCss(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      SparkFlowImage.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'sparkflow-editor',
      },
    },
    onCreate: ({ editor }) => {
      const snapshot = buildEditorSnapshot(editor.getJSON() as Record<string, unknown>);
      latestSnapshotRef.current = snapshot;
      lastSnapshotRef.current = JSON.stringify(snapshot);
      onReady?.();
      onSnapshotChange?.(snapshot);
      emitSelection(editor);
      emitToolbarState(editor);
    },
    onUpdate: ({ editor }) => {
      scheduleSnapshot(editor.getJSON() as Record<string, unknown>);
      emitToolbarState(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      emitSelection(editor);
      emitToolbarState(editor);
    },
  });

  useEffect(() => {
    return () => {
      if (snapshotTimerRef.current !== null) window.clearTimeout(snapshotTimerRef.current);
    };
  }, []);

  function handleSurfacePress(event: React.SyntheticEvent<HTMLDivElement>): void {
    /*点击编辑器空白区域时补 focus，让空白纸面与已有文字区域拥有一致输入行为。 */
    if (!editor) return;
    const target = event.target;
    const targetElement =
      target instanceof HTMLElement
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    const proseMirrorElement = targetElement?.closest('.ProseMirror');
    if (proseMirrorElement && targetElement && targetElement !== proseMirrorElement) return;
    editor.commands.focus('end', { scrollIntoView: false });
  }

  function scheduleSnapshot(document: Record<string, unknown>): void {
    /*输入时在 DOM 内构造 Markdown 快照，并以短延迟节流后再过桥。 */
    const snapshot = buildEditorSnapshot(document);
    latestSnapshotRef.current = snapshot;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSnapshotRef.current) return;
    if (snapshotTimerRef.current !== null) window.clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(() => {
      lastSnapshotRef.current = serialized;
      onSnapshotChange?.(snapshot);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  function emitSelection(currentEditor: NonNullable<typeof editor>): void {
    /*只把当前选中文本同步回原生层，避免桥接传整份文档。 */
    const { from, to } = currentEditor.state.selection;
    const text = currentEditor.state.doc.textBetween(from, to, '\n', '\n').trim();
    if (text === lastSelectionRef.current) return;
    lastSelectionRef.current = text;
    onSelectionChange?.(text);
  }

  function emitToolbarState(currentEditor: NonNullable<typeof editor>): void {
    /*同步当前格式状态，让原生工具栏可以高亮和控制撤销重做。 */
    const nextState = buildFormattingState(currentEditor);
    const serialized = JSON.stringify(nextState);
    if (serialized === lastToolbarStateRef.current) return;
    lastToolbarStateRef.current = serialized;
    onFormattingStateChange?.(nextState);
  }

  function buildEditorSnapshot(document: Record<string, unknown>): FragmentEditorSnapshot {
    /*把当前编辑器文档序列化为稳定 Markdown 快照。 */
    const bodyMarkdown = serializeDocumentToMarkdown(document);
    return {
      body_markdown: bodyMarkdown,
      plain_text: extractPlainTextFromMarkdown(bodyMarkdown),
      asset_ids: extractAssetIdsFromMarkdown(bodyMarkdown),
    };
  }

  useDOMImperativeHandle<FragmentRichEditorHandle>(ref ?? null, () => ({
    getSnapshot() {
      return latestSnapshotRef.current;
    },
    focus() {
      editor?.commands.focus();
    },
    insertImage(asset: MediaAsset) {
      if (!editor || !asset.file_url) return;
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: {
          src: asset.file_url,
          alt: asset.original_filename,
          assetId: asset.id,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        },
      }).run();
    },
    applyPatch(patch: FragmentAiPatch) {
      if (!editor) return;
      const snippet = normalizeBodyMarkdown(patch.markdown_snippet);
      if (!snippet) return;
      if (patch.op === 'replace_selection') {
        const { from, to } = editor.state.selection;
        editor.commands.insertContentAt({ from, to }, snippet);
        return;
      }
      const html = markdownRenderer.render(snippet);
      if (patch.op === 'prepend_document') {
        editor.commands.insertContentAt(0, html);
        return;
      }
      editor.commands.insertContentAt(editor.state.selection.to, html);
    },
    runCommand(command: FragmentEditorCommand) {
      if (!editor) return;
      runEditorCommand(editor, command);
    },
  }), [editor, markdownRenderer]);

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
      <style>{`:root { ${cssVars} } ${baseCss}`}</style>
      <div
        style={styles.root}
        onMouseDown={handleSurfacePress}
        onTouchStart={handleSurfacePress}
      >
        <div style={styles.surface}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

function createMarkdownRenderer(mediaAssets: MediaAsset[]): MarkdownIt {
  /*把 asset:// 图片引用渲染为可显示的实际地址，并保留 assetId 元数据。 */
  const assetMap = new Map(mediaAssets.map((item) => [item.id, item]));
  const markdown = new MarkdownIt({
    html: false,
    linkify: false,
    breaks: false,
  });
  const defaultImageRule = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const source = token.attrGet('src') ?? '';
    if (source.startsWith('asset://')) {
      const assetId = source.replace('asset://', '').trim();
      const asset = assetMap.get(assetId);
      if (asset?.file_url) token.attrSet('src', asset.file_url);
      token.attrSet('data-asset-id', assetId);
      if (asset?.width) token.attrSet('data-width', String(asset.width));
      if (asset?.height) token.attrSet('data-height', String(asset.height));
    }
    return defaultImageRule
      ? defaultImageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
  return markdown;
}

function serializeDocumentToMarkdown(document: Record<string, unknown>): string {
  /*把编辑器 JSON 序列化为轻量 Markdown，只覆盖当前产品支持的块类型。 */
  const content = Array.isArray(document.content) ? document.content : [];
  const blocks = content
    .map((node) => serializeBlock(node as Record<string, unknown>, 1))
    .filter(Boolean);
  return normalizeBodyMarkdown(blocks.join('\n\n'));
}

function serializeBlock(node: Record<string, unknown>, orderedIndex: number): string {
  /*按块类型输出稳定 Markdown 文本。 */
  const type = String(node.type ?? '');
  if (type === 'paragraph') return serializeInlineChildren(node);
  if (type === 'heading') return `# ${serializeInlineChildren(node).trim()}`.trim();
  if (type === 'blockquote') {
    const lines = getNodeContent(node)
      .map((child) => serializeBlock(child, 1))
      .filter(Boolean)
      .flatMap((block) => block.split('\n'))
      .map((line) => `> ${line}`);
    return lines.join('\n');
  }
  if (type === 'bulletList') {
    return getNodeContent(node)
      .map((child) => `- ${serializeListItem(child).trim()}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'orderedList') {
    return getNodeContent(node)
      .map((child, index) => `${index + orderedIndex}. ${serializeListItem(child).trim()}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'image') {
    const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
    const alt = escapeInlineText(String(attrs.alt ?? '').trim());
    const assetId = String(attrs.assetId ?? '').trim();
    const src = String(attrs.src ?? '').trim();
    const target = assetId ? `asset://${assetId}` : src;
    return target ? `![${alt}](${target})` : '';
  }
  return '';
}

function serializeListItem(node: Record<string, unknown>): string {
  /*列表项仅保留当前支持的单段落内容，避免生成复杂嵌套 Markdown。 */
  const children = getNodeContent(node);
  const paragraph = children.find((child) => String(child.type ?? '') === 'paragraph');
  if (!paragraph) return '';
  return serializeInlineChildren(paragraph);
}

function serializeInlineChildren(node: Record<string, unknown>): string {
  /*递归序列化段落内联内容，并保留粗体与斜体。 */
  return getNodeContent(node)
    .map((child) => serializeInlineNode(child))
    .join('')
    .trim();
}

function serializeInlineNode(node: Record<string, unknown>): string {
  /*当前只支持文本及内联样式，图片作为独立块处理。 */
  const type = String(node.type ?? '');
  if (type !== 'text') return '';
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const hasBold = marks.some((mark) => mark && typeof mark === 'object' && (mark as { type?: string }).type === 'bold');
  const hasItalic = marks.some((mark) => mark && typeof mark === 'object' && (mark as { type?: string }).type === 'italic');
  let text = escapeInlineText(String(node.text ?? ''));
  if (!text) return '';
  if (hasBold && hasItalic) return `***${text}***`;
  if (hasBold) return `**${text}**`;
  if (hasItalic) return `*${text}*`;
  return text;
}

function getNodeContent(node: Record<string, unknown>): Array<Record<string, unknown>> {
  /*安全读取节点子内容，避免消费到非数组结构。 */
  return Array.isArray(node.content)
    ? node.content.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
}

function escapeInlineText(text: string): string {
  /*转义 Markdown 内联特殊字符，避免正文被误解析。 */
  return text.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function buildFormattingState(editor: NonNullable<ReturnType<typeof useEditor>>): FragmentEditorFormattingState {
  /*从 Tiptap 当前状态提取原生工具栏需要的最小信息。 */
  let blockType: FragmentEditorFormattingState['block_type'] = 'paragraph';
  if (editor.isActive('heading', { level: 1 })) blockType = 'heading';
  else if (editor.isActive('bulletList')) blockType = 'bulletList';
  else if (editor.isActive('orderedList')) blockType = 'orderedList';
  else if (editor.isActive('blockquote')) blockType = 'blockquote';
  return {
    block_type: blockType,
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    bullet_list: editor.isActive('bulletList'),
    ordered_list: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    can_undo: editor.can().chain().focus().undo().run(),
    can_redo: editor.can().chain().focus().redo().run(),
  };
}

function runEditorCommand(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  command: FragmentEditorCommand
): void {
  /*把原生层命令映射到 Tiptap 操作，保持桥接层只暴露稳定命令枚举。 */
  const chain = editor.chain().focus();
  if (command === 'paragraph') {
    chain.setParagraph().run();
    return;
  }
  if (command === 'heading') {
    chain.toggleHeading({ level: 1 }).run();
    return;
  }
  if (command === 'blockquote') {
    chain.toggleBlockquote().run();
    return;
  }
  if (command === 'bulletList') {
    chain.toggleBulletList().run();
    return;
  }
  if (command === 'orderedList') {
    chain.toggleOrderedList().run();
    return;
  }
  if (command === 'bold') {
    chain.toggleBold().run();
    return;
  }
  if (command === 'italic') {
    chain.toggleItalic().run();
    return;
  }
  if (command === 'undo') {
    editor.commands.focus();
    editor.commands.undo();
    return;
  }
  editor.commands.focus();
  editor.commands.redo();
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100%',
    height: '100%',
    background: 'var(--editor-background)',
  },
  surface: {
    minHeight: '100%',
    height: '100%',
  },
  loading: {
    minHeight: 320,
    padding: 16,
    color: 'var(--editor-text-muted)',
    fontSize: 14,
  },
};
