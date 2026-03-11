import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import type {
  FragmentAiPatch,
  FragmentEditorCommand,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';

import FragmentRichEditorDom from './FragmentRichEditorDom';

export interface FragmentRichEditorHandle {
  [key: string]: (...args: any[]) => void;
  getSnapshot: () => FragmentEditorSnapshot | null;
  focus: () => void;
  insertImage: (asset: MediaAsset) => void;
  applyPatch: (patch: FragmentAiPatch) => void;
  runCommand: (command: FragmentEditorCommand) => void;
}

interface FragmentRichEditorProps {
  editorKey: string;
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  initialBodyMarkdown: string;
  mediaAssets: MediaAsset[];
  statusLabel?: string | null;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: FragmentEditorSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: FragmentEditorFormattingState) => void;
}

export function FragmentRichEditor({
  editorKey,
  editorRef,
  initialBodyMarkdown,
  mediaAssets,
  statusLabel,
  onEditorReady,
  onSnapshotChange,
  onSelectionChange,
  onFormattingStateChange,
}: FragmentRichEditorProps) {
  /*渲染编辑器主视图，让正文成为碎片详情页的唯一主内容。 */
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.editorShell}>
        <FragmentRichEditorDom
          key={editorKey}
          ref={editorRef}
          initialBodyMarkdown={initialBodyMarkdown}
          mediaAssets={mediaAssets}
          theme={theme}
          onReady={onEditorReady}
          onSnapshotChange={onSnapshotChange}
          onSelectionChange={onSelectionChange}
          onFormattingStateChange={onFormattingStateChange}
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
  editorShell: {
    flex: 1,
    overflow: 'hidden',
  },
  domSurface: {
    minHeight: 520,
    width: '100%',
    backgroundColor: 'transparent',
  },
});
