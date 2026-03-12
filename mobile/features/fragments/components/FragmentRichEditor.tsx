import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import type {
  EditorBridgeAdapter,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';

import FragmentRichEditorDom from './FragmentRichEditorDom';

export interface FragmentRichEditorHandle extends EditorBridgeAdapter {
  [key: string]: (...args: any[]) => any;
}

interface FragmentRichEditorProps {
  editorKey: string;
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  initialBodyMarkdown: string;
  autoFocus?: boolean;
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
  autoFocus = false,
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
          autoFocus={autoFocus}
          mediaAssets={mediaAssets}
          theme={theme}
          onReady={onEditorReady}
          onSnapshotChange={onSnapshotChange}
          onSelectionChange={onSelectionChange}
          onFormattingStateChange={onFormattingStateChange}
          dom={{
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
    flex: 1,
    minHeight: 520,
    height: '100%',
    width: '100%',
    backgroundColor: 'transparent',
  },
});
