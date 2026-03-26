import React from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type OnChangeSelectionEvent,
  type OnChangeStateEvent,
} from 'react-native-enriched';

import {
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
  stripEdgeEmptyParagraphs,
  unwrapHtmlFromNativeEditor,
  wrapHtmlForNativeEditor,
} from '@/features/editor/html';
import { useAppTheme } from '@/theme/useAppTheme';
import type {
  EditorCommand,
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorSurfaceHandle,
} from '@/features/editor/types';

interface ContentRichEditorProps {
  editorKey: string;
  editorRef: React.RefObject<EditorSurfaceHandle | null>;
  initialBodyHtml: string;
  autoFocus?: boolean;
  mediaAssets: EditorMediaAsset[];
  onFocus?: () => void;
  onBlur?: () => void;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: EditorDocumentSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: EditorFormattingState) => void;
}

async function readSnapshotFromNativeEditor(
  editor: EnrichedTextInputInstance | null,
  mediaAssets: EditorMediaAsset[]
): Promise<EditorDocumentSnapshot | null> {
  /*保存前直接向原生编辑器请求当前 HTML，减少桥接事件延迟带来的丢字风险。 */
  if (!editor) return null;
  const nextHtml = await editor.getHTML();
  return buildSnapshotFromHtml(nextHtml, mediaAssets);
}

function replaceAssetIdsWithDisplayUrls(html: string, mediaAssets: EditorMediaAsset[]): string {
  /*把持久化 asset:// 引用替换成当前可显示 URL，保证编辑器内图片可见。 */
  let nextHtml = normalizeBodyHtml(html);
  for (const asset of mediaAssets) {
    if (!asset.file_url) continue;
    nextHtml = nextHtml.replaceAll(`src="asset://${asset.id}"`, `src="${asset.file_url}"`);
    nextHtml = nextHtml.replaceAll(`src='asset://${asset.id}'`, `src='${asset.file_url}'`);
  }
  return nextHtml;
}

function replaceDisplayUrlsWithAssetIds(html: string, mediaAssets: EditorMediaAsset[]): string {
  /*把编辑器里的显示 URL 回写成 asset:// 引用，保持同步和导出协议稳定。 */
  let nextHtml = normalizeBodyHtml(html);
  for (const asset of mediaAssets) {
    if (!asset.file_url) continue;
    nextHtml = nextHtml.replaceAll(`src="${asset.file_url}"`, `src="asset://${asset.id}"`);
    nextHtml = nextHtml.replaceAll(`src='${asset.file_url}'`, `src='asset://${asset.id}'`);
  }
  return nextHtml;
}

function buildSnapshotFromHtml(html: string, mediaAssets: EditorMediaAsset[]): EditorDocumentSnapshot {
  /*把编辑器输出规整成 HTML-first 快照，供会话层和同步链路消费。 */
  const persistedHtml = replaceDisplayUrlsWithAssetIds(
    unwrapHtmlFromNativeEditor(html),
    mediaAssets
  );
  return {
    body_html: persistedHtml,
    plain_text: extractPlainTextFromHtml(persistedHtml),
    asset_ids: extractAssetIdsFromHtml(persistedHtml),
  };
}

function buildFormattingState(event: OnChangeStateEvent): EditorFormattingState {
  /*把原生样式探测结果收敛成页面工具栏需要的最小协议。 */
  let blockType: EditorFormattingState['block_type'] = 'paragraph';
  if (event.h1.isActive) blockType = 'heading';
  else if (event.unorderedList.isActive) blockType = 'bulletList';
  else if (event.orderedList.isActive) blockType = 'orderedList';
  else if (event.blockQuote.isActive) blockType = 'blockquote';
  return {
    block_type: blockType,
    bold: event.bold.isActive,
    italic: event.italic.isActive,
    bullet_list: event.unorderedList.isActive,
    ordered_list: event.orderedList.isActive,
    blockquote: event.blockQuote.isActive,
    can_undo: false,
    can_redo: false,
  };
}

export function ContentRichEditor({
  editorKey,
  editorRef,
  initialBodyHtml,
  autoFocus = false,
  mediaAssets,
  onFocus,
  onBlur,
  onEditorReady,
  onSnapshotChange,
  onSelectionChange,
  onFormattingStateChange,
}: ContentRichEditorProps) {
  /*用原生富文本输入承接共享编辑器底座，并维持统一桥接接口。 */
  const theme = useAppTheme();
  const nativeRef = React.useRef<EnrichedTextInputInstance | null>(null);
  const editorBackground = theme.name === 'dark' ? '#111113' : '#F2F2F7';
  const [seededEditorHtml, setSeededEditorHtml] = React.useState(() =>
    wrapHtmlForNativeEditor(
      replaceAssetIdsWithDisplayUrls(stripEdgeEmptyParagraphs(initialBodyHtml), mediaAssets)
    )
  );
  const latestSnapshotRef = React.useRef<EditorDocumentSnapshot>({
    body_html: normalizeBodyHtml(initialBodyHtml),
    plain_text: extractPlainTextFromHtml(initialBodyHtml),
    asset_ids: extractAssetIdsFromHtml(initialBodyHtml),
  });
  const snapshotTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const formattingStateRef = React.useRef<EditorFormattingState | null>(null);
  const contextMenuItems = React.useMemo(
    () => [
      {
        text: '正文',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'paragraph');
        },
      },
      {
        text: '标题',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'heading');
        },
      },
      {
        text: '粗体',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'bold');
        },
      },
      {
        text: '斜体',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'italic');
        },
      },
      {
        text: '列表',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'bulletList');
        },
      },
      {
        text: '编号',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'orderedList');
        },
      },
      {
        text: '引用',
        onPress: () => {
          runCommand(nativeRef.current, formattingStateRef.current, 'blockquote');
        },
      },
    ],
    []
  );

  React.useImperativeHandle(
    editorRef,
    () => ({
      getSnapshot() {
        return latestSnapshotRef.current;
      },
      async readSnapshot() {
        const snapshot = await readSnapshotFromNativeEditor(nativeRef.current, mediaAssets);
        if (snapshot) {
          latestSnapshotRef.current = snapshot;
        }
        return snapshot ?? latestSnapshotRef.current;
      },
      focus() {
        nativeRef.current?.focus();
      },
      blur() {
        nativeRef.current?.blur();
      },
      insertImage(asset: EditorMediaAsset) {
        if (!asset.file_url) return;
        nativeRef.current?.setImage(asset.file_url, asset.width ?? 320, asset.height ?? 180);
      },
      runCommand(command: EditorCommand) {
        runCommand(nativeRef.current, formattingStateRef.current, command);
      },
    }),
    [editorRef, mediaAssets]
  );

  React.useEffect(() => {
    /*只在真正切换编辑会话时重置初始正文，避免输入中被新 defaultValue 回灌。 */
    const strippedInitialHtml = stripEdgeEmptyParagraphs(initialBodyHtml);
    const nextSeededHtml = wrapHtmlForNativeEditor(
      replaceAssetIdsWithDisplayUrls(strippedInitialHtml, mediaAssets)
    );
    setSeededEditorHtml(nextSeededHtml);
    latestSnapshotRef.current = buildSnapshotFromHtml(nextSeededHtml, mediaAssets);
  }, [editorKey, initialBodyHtml, mediaAssets]);

  React.useEffect(() => {
    /*桥接挂载后立即通知会话层进入可交互态。 */
    onEditorReady();
  }, [editorKey, onEditorReady]);

  React.useEffect(() => {
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, []);

  const flushSnapshotChange = React.useCallback(() => {
    /*失焦时立即把最后一版快照抛给会话层，避免顶部按钮保存时还在等防抖定时器。 */
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    onSnapshotChange(latestSnapshotRef.current);
  }, [onSnapshotChange]);

  const handleHtmlChange = React.useCallback(
    (nextHtml: string) => {
      latestSnapshotRef.current = buildSnapshotFromHtml(nextHtml, mediaAssets);
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = setTimeout(() => {
        snapshotTimerRef.current = null;
        onSnapshotChange(latestSnapshotRef.current);
      }, 120);
    },
    [mediaAssets, onSnapshotChange]
  );

  return (
    <View style={[styles.container, { backgroundColor: editorBackground }]}>
      <View style={[styles.editorShell, { backgroundColor: editorBackground }]}>
        <EnrichedTextInput
          key={editorKey}
          ref={nativeRef}
          autoFocus={autoFocus}
          defaultValue={seededEditorHtml}
          placeholder=""
          autoCapitalize="sentences"
          style={{ ...styles.input, backgroundColor: editorBackground }}
          contextMenuItems={contextMenuItems}
          onFocus={onFocus}
          onChangeHtml={(event) => {
            handleHtmlChange(event.nativeEvent.value);
          }}
          onBlur={() => {
            flushSnapshotChange();
            onBlur?.();
          }}
          onChangeSelection={(event: NativeSyntheticEvent<OnChangeSelectionEvent>) => {
            onSelectionChange(event.nativeEvent.text ?? '');
          }}
          onChangeState={(event: NativeSyntheticEvent<OnChangeStateEvent>) => {
            const nextState = buildFormattingState(event.nativeEvent);
            formattingStateRef.current = nextState;
            onFormattingStateChange(nextState);
          }}
          androidExperimentalSynchronousEvents={true}
          scrollEnabled={true}
        />
      </View>
    </View>
  );
}

function runCommand(
  editor: EnrichedTextInputInstance | null,
  formattingState: EditorFormattingState | null,
  command: EditorCommand
) {
  /*把页面层命令映射到 react-native-enriched 的原生方法。 */
  if (!editor) return;
  if (command === 'paragraph') {
    if (formattingState?.block_type === 'heading') editor.toggleH1();
    else if (formattingState?.blockquote) editor.toggleBlockQuote();
    else if (formattingState?.bullet_list) editor.toggleUnorderedList();
    else if (formattingState?.ordered_list) editor.toggleOrderedList();
    return;
  }
  if (command === 'heading') {
    editor.toggleH1();
    return;
  }
  if (command === 'blockquote') {
    editor.toggleBlockQuote();
    return;
  }
  if (command === 'bulletList') {
    editor.toggleUnorderedList();
    return;
  }
  if (command === 'orderedList') {
    editor.toggleOrderedList();
    return;
  }
  if (command === 'bold') {
    editor.toggleBold();
    return;
  }
  if (command === 'italic') {
    editor.toggleItalic();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editorShell: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
  },
});
