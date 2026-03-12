import React from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type HtmlStyle,
  type OnChangeSelectionEvent,
  type OnChangeStateEvent,
} from 'react-native-enriched';

import { useAppTheme } from '@/theme/useAppTheme';
import type {
  EditorBridgeAdapter,
  FragmentAiPatch,
  FragmentEditorCommand,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import {
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/fragments/bodyMarkdown';

export interface FragmentRichEditorHandle extends EditorBridgeAdapter {
  [key: string]: (...args: any[]) => any;
}

interface FragmentRichEditorProps {
  editorKey: string;
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  initialBodyHtml: string;
  autoFocus?: boolean;
  mediaAssets: MediaAsset[];
  statusLabel?: string | null;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: FragmentEditorSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: FragmentEditorFormattingState) => void;
}

function replaceAssetIdsWithDisplayUrls(html: string, mediaAssets: MediaAsset[]): string {
  /*把持久化 asset:// 引用替换成当前可显示 URL，保证编辑器内图片可见。 */
  let nextHtml = normalizeBodyHtml(html);
  for (const asset of mediaAssets) {
    if (!asset.file_url) continue;
    nextHtml = nextHtml.replaceAll(`src="asset://${asset.id}"`, `src="${asset.file_url}"`);
    nextHtml = nextHtml.replaceAll(`src='asset://${asset.id}'`, `src='${asset.file_url}'`);
  }
  return nextHtml;
}

function replaceDisplayUrlsWithAssetIds(html: string, mediaAssets: MediaAsset[]): string {
  /*把编辑器里的显示 URL 回写成 asset:// 引用，保持同步和导出协议稳定。 */
  let nextHtml = normalizeBodyHtml(html);
  for (const asset of mediaAssets) {
    if (!asset.file_url) continue;
    nextHtml = nextHtml.replaceAll(`src="${asset.file_url}"`, `src="asset://${asset.id}"`);
    nextHtml = nextHtml.replaceAll(`src='${asset.file_url}'`, `src='asset://${asset.id}'`);
  }
  return nextHtml;
}

function buildSnapshotFromHtml(html: string, mediaAssets: MediaAsset[]): FragmentEditorSnapshot {
  /*把编辑器输出规整成 HTML-first 快照，供会话层和同步链路消费。 */
  const persistedHtml = replaceDisplayUrlsWithAssetIds(html, mediaAssets);
  return {
    body_html: persistedHtml,
    plain_text: extractPlainTextFromHtml(persistedHtml),
    asset_ids: extractAssetIdsFromHtml(persistedHtml),
  };
}

function buildFormattingState(event: OnChangeStateEvent): FragmentEditorFormattingState {
  /*把原生样式探测结果收敛成页面工具栏需要的最小协议。 */
  let blockType: FragmentEditorFormattingState['block_type'] = 'paragraph';
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

export function FragmentRichEditor({
  editorKey,
  editorRef,
  initialBodyHtml,
  autoFocus = false,
  mediaAssets,
  statusLabel,
  onEditorReady,
  onSnapshotChange,
  onSelectionChange,
  onFormattingStateChange,
}: FragmentRichEditorProps) {
  /*用原生富文本输入替换 WebView 编辑器，并维持页面层既有桥接接口。 */
  const theme = useAppTheme();
  const nativeRef = React.useRef<EnrichedTextInputInstance | null>(null);
  const latestSnapshotRef = React.useRef<FragmentEditorSnapshot>({
    body_html: normalizeBodyHtml(initialBodyHtml),
    plain_text: extractPlainTextFromHtml(initialBodyHtml),
    asset_ids: extractAssetIdsFromHtml(initialBodyHtml),
  });
  const snapshotTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const formattingStateRef = React.useRef<FragmentEditorFormattingState | null>(null);

  const initialEditorHtml = React.useMemo(
    () => replaceAssetIdsWithDisplayUrls(initialBodyHtml, mediaAssets),
    [initialBodyHtml, mediaAssets]
  );

  const htmlStyle = React.useMemo<HtmlStyle>(
    () => ({
      h1: {
        fontSize: 28,
        bold: true,
      },
      blockquote: {
        borderColor: theme.colors.primary,
        borderWidth: 3,
        gapWidth: 12,
        color: theme.colors.textSubtle,
      },
      ol: {
        gapWidth: 8,
        marginLeft: 14,
        markerColor: theme.colors.textSubtle,
        markerFontWeight: '600',
      },
      ul: {
        gapWidth: 8,
        marginLeft: 14,
        bulletColor: theme.colors.textSubtle,
        bulletSize: 6,
      },
    }),
    [theme.colors.primary, theme.colors.textSubtle]
  );

  React.useImperativeHandle(
    editorRef,
    () => ({
      getSnapshot() {
        return latestSnapshotRef.current;
      },
      focus() {
        nativeRef.current?.focus();
      },
      insertImage(asset: MediaAsset) {
        if (!asset.file_url) return;
        nativeRef.current?.setImage(asset.file_url, asset.width ?? 320, asset.height ?? 180);
      },
      applyPatch(_patch: FragmentAiPatch) {
        /*AI patch 本期下线，保留桥接方法避免页面层判空。 */
      },
      runCommand(command: FragmentEditorCommand) {
        runCommand(nativeRef.current, formattingStateRef.current, command);
      },
    }),
    [editorRef]
  );

  React.useEffect(() => {
    latestSnapshotRef.current = buildSnapshotFromHtml(initialEditorHtml, mediaAssets);
  }, [initialEditorHtml, mediaAssets]);

  React.useEffect(() => {
    onEditorReady();
  }, [editorKey, onEditorReady]);

  React.useEffect(() => {
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, []);

  const handleHtmlChange = React.useCallback(
    (nextHtml: string) => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = setTimeout(() => {
        const snapshot = buildSnapshotFromHtml(nextHtml, mediaAssets);
        latestSnapshotRef.current = snapshot;
        onSnapshotChange(snapshot);
      }, 120);
    },
    [mediaAssets, onSnapshotChange]
  );

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.editorShell,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <EnrichedTextInput
          key={editorKey}
          ref={nativeRef}
          autoFocus={autoFocus}
          defaultValue={initialEditorHtml}
          htmlStyle={htmlStyle}
          placeholder="把灵感整理成可用正文..."
          placeholderTextColor={theme.colors.textSubtle}
          cursorColor={theme.colors.primary}
          selectionColor={`${theme.colors.primary}33`}
          autoCapitalize="sentences"
          style={{
            ...styles.input,
            color: theme.colors.text,
            backgroundColor: 'transparent',
          }}
          onChangeHtml={(event) => {
            handleHtmlChange(event.nativeEvent.value);
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
      {statusLabel ? <View style={styles.hiddenStatus} accessible={false} /> : null}
    </View>
  );
}

function runCommand(
  editor: EnrichedTextInputInstance | null,
  formattingState: FragmentEditorFormattingState | null,
  command: FragmentEditorCommand
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
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 520,
    paddingHorizontal: 20,
    paddingVertical: 20,
    fontSize: 18,
    lineHeight: 28,
  },
  hiddenStatus: {
    width: 0,
    height: 0,
  },
});
