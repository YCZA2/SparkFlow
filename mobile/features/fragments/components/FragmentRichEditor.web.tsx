import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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

function buildSnapshotFromHtml(html: string): FragmentEditorSnapshot {
  /*Web 降级编辑器仍输出同一份 HTML-first 快照协议。 */
  const normalized = normalizeBodyHtml(html);
  return {
    body_html: normalized,
    plain_text: extractPlainTextFromHtml(normalized),
    asset_ids: extractAssetIdsFromHtml(normalized),
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
  /*Web 端用轻量文本输入兜底，避免静态渲染解析 native 富文本实现。 */
  const theme = useAppTheme();
  const inputRef = React.useRef<TextInput | null>(null);
  const [value, setValue] = React.useState(() => normalizeBodyHtml(initialBodyHtml));
  const latestSnapshotRef = React.useRef<FragmentEditorSnapshot>(buildSnapshotFromHtml(initialBodyHtml));

  React.useEffect(() => {
    const nextValue = normalizeBodyHtml(initialBodyHtml);
    setValue(nextValue);
    latestSnapshotRef.current = buildSnapshotFromHtml(nextValue);
  }, [editorKey, initialBodyHtml, mediaAssets]);

  React.useEffect(() => {
    onFormattingStateChange({
      block_type: 'paragraph',
      bold: false,
      italic: false,
      bullet_list: false,
      ordered_list: false,
      blockquote: false,
      can_undo: false,
      can_redo: false,
    });
    onEditorReady();
  }, [editorKey, onEditorReady, onFormattingStateChange]);

  React.useImperativeHandle(
    editorRef,
    () => ({
      getSnapshot() {
        return latestSnapshotRef.current;
      },
      focus() {
        inputRef.current?.focus();
      },
      insertImage(_asset: MediaAsset) {
        /*Web 降级编辑器不做内联图片插入，避免伪造富文本行为。 */
      },
      applyPatch(_patch: FragmentAiPatch) {
        /*AI patch 本期下线，保留桥接方法避免页面层判空。 */
      },
      runCommand(_command: FragmentEditorCommand) {
        /*Web 降级编辑器不支持富文本命令，但保留桥接接口。 */
      },
    }),
    [editorRef]
  );

  const handleChangeText = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeBodyHtml(nextValue);
      setValue(normalized);
      onSelectionChange(normalized);
      const snapshot = buildSnapshotFromHtml(normalized);
      latestSnapshotRef.current = snapshot;
      onSnapshotChange(snapshot);
    },
    [onSelectionChange, onSnapshotChange]
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
        <TextInput
          key={editorKey}
          ref={inputRef}
          autoFocus={autoFocus}
          multiline={true}
          placeholder="把灵感整理成可用正文..."
          placeholderTextColor={theme.colors.textSubtle}
          selectionColor={`${theme.colors.primary}33`}
          style={[
            styles.input,
            {
              color: theme.colors.text,
            },
          ]}
          value={value}
          onChangeText={handleChangeText}
        />
      </View>
      {statusLabel ? <View style={styles.hiddenStatus} accessible={false} /> : null}
    </View>
  );
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
    textAlignVertical: 'top',
  },
  hiddenStatus: {
    width: 0,
    height: 0,
  },
});
