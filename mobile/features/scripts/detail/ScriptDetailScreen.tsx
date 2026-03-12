import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import { ContentEditorScaffold } from '@/features/editor/components/ContentEditorScaffold';
import { ContentRichEditor } from '@/features/editor/components/ContentRichEditor';
import { useScriptDetailScreen } from '@/features/scripts/detail/useScriptDetailScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import { formatDate } from '@/utils/date';

const SCRIPT_EDITOR_CAPABILITIES = {
  supportsImages: false,
  supportsDetailSheet: false,
  supportsTitle: true,
  supportsAiTools: false,
} as const;

function modeLabel(mode: string): string {
  /*把脚本生成模式映射成更易读的前端文案。 */
  return mode === 'mode_a' ? '导师爆款模式' : '我的专属二脑';
}

function ScriptMetaCard({
  mode,
  status,
  createdAt,
}: {
  mode: string;
  status: string;
  createdAt: string | null;
}) {
  /*把脚本元信息收成轻量卡片，避免和正文编辑区互相打架。 */
  const theme = useAppTheme();

  return (
    <View style={[styles.metaCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.metaRow, { color: theme.colors.text }]}>模式：{modeLabel(mode)}</Text>
      <Text style={[styles.metaRow, { color: theme.colors.text }]}>状态：{status}</Text>
      <Text style={[styles.metaRow, { color: theme.colors.textSubtle }]}>
        创建时间：{createdAt ? formatDate(createdAt) : '-'}
      </Text>
    </View>
  );
}

function ShootButton({ onPress }: { onPress: () => void }) {
  /*保留脚本页直达拍摄入口，继续把正文闭环串起来。 */
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      style={[styles.shootButton, { backgroundColor: theme.colors.danger }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <Text style={styles.shootButtonText}>一键去拍摄</Text>
    </TouchableOpacity>
  );
}

export function ScriptDetailScreen({ scriptId }: { scriptId?: string | null }) {
  /*脚本详情页复用共享编辑壳层，只在本模块维护 remote-only 保存策略。 */
  const screen = useScriptDetailScreen(scriptId);
  const script = screen.resource.script;
  const editor = screen.editor;

  return (
    <ContentEditorScaffold
      capabilities={SCRIPT_EDITOR_CAPABILITIES}
      isLoading={screen.resource.isLoading}
      error={screen.resource.error}
      isDraftHydrated={editor.isDraftHydrated}
      formattingState={editor.formattingState}
      statusLabel={editor.statusLabel}
      editorRef={editor.editorRef}
      onBack={screen.actions.goBack}
      onDone={screen.actions.done}
      onRetry={() => {
        void screen.resource.reload();
      }}
      onShare={screen.actions.share}
      topContent={
        script ? (
          <ScriptMetaCard mode={script.mode} status={script.status} createdAt={script.created_at} />
        ) : null
      }
      bottomAccessory={
        script ? <ShootButton onPress={screen.actions.shoot} /> : null
      }
      editor={
        <ContentRichEditor
          editorKey={editor.editorKey}
          editorRef={editor.editorRef}
          initialBodyHtml={editor.initialBodyHtml}
          autoFocus={editor.shouldAutoFocus}
          mediaAssets={editor.mediaAssets}
          onBlur={editor.onEditorBlur}
          onEditorReady={editor.onEditorReady}
          onSnapshotChange={editor.onSnapshotChange}
          onSelectionChange={editor.onSelectionChange}
          onFormattingStateChange={editor.onFormattingStateChange}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  metaCard: {
    borderRadius: 18,
    padding: 14,
  },
  metaRow: {
    fontSize: 14,
    lineHeight: 22,
  },
  shootButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shootButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
