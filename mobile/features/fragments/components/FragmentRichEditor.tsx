import React from 'react';
import { StyleSheet, View } from 'react-native';

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
  onEditorReady: () => void;
  onDocumentChange: (document: EditorDocument) => void;
  onSelectionChange: (range: EditorSelectionRange | null, text: string) => void;
}

export function FragmentRichEditor({
  editorRef,
  document,
  statusLabel,
  onEditorReady,
  onDocumentChange,
  onSelectionChange,
}: FragmentRichEditorProps) {
  /** 中文注释：渲染编辑器主视图，让正文成为碎片详情页的唯一主内容。 */
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        {statusLabel ? (
          <Text style={[styles.statusText, { color: theme.colors.textSubtle }]}>{statusLabel}</Text>
        ) : null}
      </View>

      <View style={[styles.editorShell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <FragmentRichEditorDom
          ref={editorRef}
          document={document}
          theme={theme}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  editorShell: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
  },
  domSurface: {
    minHeight: 480,
    width: '100%',
    backgroundColor: 'transparent',
  },
});
