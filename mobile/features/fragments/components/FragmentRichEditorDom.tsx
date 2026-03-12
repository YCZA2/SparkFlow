'use dom';

import React, { useEffect, useMemo, useRef } from 'react';
import { useDOMImperativeHandle, type DOMProps } from 'expo/dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

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
  createEditorCssVars,
  createEditorBaseCss,
} from '@/components/editor/styles/editorTheme';
import { normalizeBodyMarkdown } from '@/features/fragments/bodyMarkdown';

import {
  applyPatchToEditor,
  buildEditorSnapshot,
  buildFormattingState,
  createMarkdownRenderer,
  runEditorCommand,
  syncEditorImages,
} from './fragmentRichEditorBridge';

const SNAPSHOT_DEBOUNCE_MS = 180;

interface FragmentRichEditorDomProps {
  ref?: React.Ref<FragmentRichEditorHandle>;
  dom?: DOMProps;
  initialBodyMarkdown: string;
  autoFocus?: boolean;
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
  autoFocus = false,
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
      /*新建空白正文时在 DOM ready 后主动聚焦，避免首击落在宿主空白区却看不到光标。 */
      if (autoFocus) {
        window.requestAnimationFrame(() => {
          editor.commands.focus('end', { scrollIntoView: false });
        });
      }
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
    /*异步 hydrate 后若仍处在自动聚焦场景，再补一次 focus 保证首屏可输入。 */
    if (!editor || !autoFocus) return;
    window.requestAnimationFrame(() => {
      editor.commands.focus('end', { scrollIntoView: false });
    });
  }, [autoFocus, editor]);

  useEffect(() => {
    /*素材地址或尺寸发生变化时，同步更新已有图片节点，避免停留旧链接。 */
    if (!editor) return;
    syncEditorImages(editor, mediaAssets);
  }, [editor, mediaAssets]);

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
      applyPatchToEditor(editor, patch, (markdown) => markdownRenderer.render(markdown));
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
