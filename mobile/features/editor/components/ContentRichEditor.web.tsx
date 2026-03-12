import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/editor/html';
import type {
  EditorCommand,
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorSurfaceHandle,
} from '@/features/editor/types';
import { useAppTheme } from '@/theme/useAppTheme';

interface ContentRichEditorProps {
  editorKey: string;
  editorRef: React.RefObject<EditorSurfaceHandle | null>;
  initialBodyHtml: string;
  autoFocus?: boolean;
  mediaAssets: EditorMediaAsset[];
  onBlur?: () => void;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: EditorDocumentSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: EditorFormattingState) => void;
}

function buildSnapshotFromHtml(html: string): EditorDocumentSnapshot {
  /*Web 降级编辑器仍输出同一份 HTML-first 快照协议。 */
  const normalized = normalizeBodyHtml(html);
  return {
    body_html: normalized,
    plain_text: extractPlainTextFromHtml(normalized),
    asset_ids: extractAssetIdsFromHtml(normalized),
  };
}

export function ContentRichEditor({
  editorKey,
  editorRef,
  initialBodyHtml,
  autoFocus = false,
  mediaAssets,
  onBlur,
  onEditorReady,
  onSnapshotChange,
  onSelectionChange,
  onFormattingStateChange,
}: ContentRichEditorProps) {
  /*Web 端用轻量文本输入兜底，避免静态渲染解析 native 富文本实现。 */
  const theme = useAppTheme();
  const inputRef = React.useRef<TextInput | null>(null);
  const [value, setValue] = React.useState(() => normalizeBodyHtml(initialBodyHtml));
  const latestSnapshotRef = React.useRef<EditorDocumentSnapshot>(buildSnapshotFromHtml(initialBodyHtml));

  React.useEffect(() => {
    /*只在切换到另一条会话时重置输入值，避免本地输入被父层新 props 覆盖。 */
    const nextValue = normalizeBodyHtml(initialBodyHtml);
    setValue(nextValue);
    latestSnapshotRef.current = buildSnapshotFromHtml(nextValue);
  }, [editorKey]);

  React.useEffect(() => {
    /*Web 降级模式固定输出纯正文格式态，保证页面工具条不会抖动。 */
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
      insertImage(_asset: EditorMediaAsset) {
        /*Web 降级编辑器不做内联图片插入，避免伪造富文本行为。 */
      },
      runCommand(_command: EditorCommand) {
        /*Web 降级编辑器不支持富文本命令，但保留桥接接口。 */
      },
    }),
    [editorRef]
  );

  const handleChangeText = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeBodyHtml(nextValue);
      const snapshot = buildSnapshotFromHtml(normalized);
      setValue(normalized);
      onSelectionChange(normalized);
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
          onBlur={() => {
            onBlur?.();
          }}
        />
      </View>
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
});
