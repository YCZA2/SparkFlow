import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';
import type {
  EditorDocument,
  EditorNode,
  EditorSelectionRange,
  FragmentAiPatch,
} from '@/types/fragment';

import FragmentRichEditorDom from './FragmentRichEditorDom';

export interface FragmentRichEditorHandle {
  [key: string]: (...args: any[]) => void;
  setDocument: (document: EditorDocument) => void;
  focus: () => void;
  insertImage: (node: EditorNode) => void;
  applyPatch: (patch: FragmentAiPatch) => void;
}

interface FragmentRichEditorProps {
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  document: EditorDocument;
  statusLabel?: string | null;
  isUploadingImage?: boolean;
  isAiRunning?: boolean;
  onEditorReady: () => void;
  onDocumentChange: (document: EditorDocument) => void;
  onSelectionChange: (range: EditorSelectionRange | null, text: string) => void;
  onInsertImage: () => Promise<void>;
  onAiAction: (instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed') => Promise<void>;
}

export function FragmentRichEditor({
  editorRef,
  document,
  statusLabel,
  isUploadingImage = false,
  isAiRunning = false,
  onEditorReady,
  onDocumentChange,
  onSelectionChange,
  onInsertImage,
  onAiAction,
}: FragmentRichEditorProps) {
  /** 中文注释：渲染原生外层卡片和 DOM 富文本编辑器桥接容器。 */
  const theme = useAppTheme();

  return (
    <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>整理正文</Text>
        {statusLabel ? <Text style={[styles.statusText, { color: theme.colors.textSubtle }]}>{statusLabel}</Text> : null}
      </View>
      <Text style={[styles.hintText, { color: theme.colors.textSubtle }]}>
        这里编辑的是碎片正式正文，AI、导出和脚本生成都会直接读取这份富文本内容。
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarRow}>
        <ToolbarButton label={isUploadingImage ? '插图中' : '插图'} onPress={() => void onInsertImage()} />
        <ToolbarButton label={isAiRunning ? 'AI处理中' : '润色'} onPress={() => void onAiAction('polish')} />
        <ToolbarButton label="压缩" onPress={() => void onAiAction('shorten')} />
        <ToolbarButton label="扩写" onPress={() => void onAiAction('expand')} />
        <ToolbarButton label="标题建议" onPress={() => void onAiAction('title')} />
        <ToolbarButton label="脚本草稿" onPress={() => void onAiAction('script_seed')} />
      </ScrollView>

      <View style={[styles.editorShell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
        <FragmentRichEditorDom
          ref={editorRef}
          document={document}
          onReady={onEditorReady}
          onDocumentChange={onDocumentChange}
          onSelectionChange={(payload) => onSelectionChange(payload.range, payload.text)}
          dom={{
            matchContents: true,
            style: styles.domSurface,
          }}
        />
      </View>
    </View>
  );
}

function ToolbarButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.toolButton,
        {
          backgroundColor: theme.colors.surfaceMuted,
        },
      ]}
    >
      <Text style={[styles.toolButtonText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  toolbarRow: {
    gap: 8,
    paddingBottom: 8,
  },
  toolButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editorShell: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 320,
  },
  domSurface: {
    minHeight: 320,
    width: '100%',
    backgroundColor: 'transparent',
  },
});
