import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { FragmentDetailSheet } from '@/features/fragments/components/FragmentDetailSheet';
import { FragmentEditorToolbar } from '@/features/fragments/components/FragmentEditorToolbar';
import { FragmentRichEditor } from '@/features/fragments/components/FragmentRichEditor';
import { useAppTheme } from '@/theme/useAppTheme';

import { useFragmentDetailScreen } from './useFragmentDetailScreen';

function HeaderCircleButton({
  symbol,
  filled = false,
  dark = false,
  disabled = false,
  onPress,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  filled?: boolean;
  dark?: boolean;
  disabled?: boolean;
  onPress: () => void | Promise<void>;
}) {
  /** 中文注释：统一顶部圆形操作按钮，保持详情页主视图的备忘录式视觉密度。 */
  const backgroundColor = filled ? '#D8B23C' : dark ? '#1B1916' : '#EFECE6';
  const borderColor = filled ? '#E9CC68' : dark ? '#2A2723' : '#F7F4EF';
  const tintColor = filled ? '#FFF6C9' : dark ? '#F7F3ED' : '#23201C';

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={() => {
        void onPress();
      }}
      style={[styles.headerCircleButton, { backgroundColor, borderColor, opacity: disabled ? 0.42 : 1 }]}
    >
      <SymbolView name={symbol} size={24} tintColor={tintColor} />
    </TouchableOpacity>
  );
}

function EditorSkeleton({ dark = false }: { dark?: boolean }) {
  /** 中文注释：在详情资源或 DOM 编辑器未就绪时渲染纸张骨架，减少首屏空白感。 */
  const lineColor = dark ? '#1E1C19' : '#DFDAD2';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonHeading, { backgroundColor: lineColor, width: '42%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '96%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '88%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '93%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '90%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '84%' }]} />
      <View style={[styles.skeletonLine, { backgroundColor: lineColor, width: '91%' }]} />
      <View style={[styles.skeletonSpacer, { backgroundColor: lineColor, width: '64%' }]} />
    </View>
  );
}

export function FragmentDetailScreen({ fragmentId }: { fragmentId?: string | null }) {
  /** 中文注释：只消费 screen view-model 渲染碎片详情页面，避免页面层混入保存流程细节。 */
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const screen = useFragmentDetailScreen(fragmentId);
  const fragment = screen.fragment;
  const isDark = theme.name === 'dark';
  const noteBackground = isDark ? '#12110F' : '#ECE9E4';
  const noteText = isDark ? '#F7F3ED' : '#23201C';
  const chromePill = isDark ? '#181715' : '#F1EEEA';

  const renderPageHeader = (options?: { disableActions?: boolean }) => (
    <View style={styles.headerRow}>
      <HeaderCircleButton symbol="chevron.left" dark={isDark} onPress={screen.goBack} />

      <View style={styles.headerActions}>
        <HeaderCircleButton
          symbol="arrow.uturn.backward"
          dark={isDark}
          disabled={options?.disableActions || !screen.bodySession.formattingState?.can_undo}
          onPress={() => screen.bodySession.editorRef.current?.runCommand('undo')}
        />
        <View
          style={[
            styles.headerPill,
            {
              backgroundColor: chromePill,
              borderColor: isDark ? '#2A2723' : '#F7F4EF',
              opacity: options?.disableActions ? 0.55 : 1,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={options?.disableActions}
            style={styles.headerPillButton}
            onPress={() => {
              void screen.handleShare();
            }}
          >
            <SymbolView name="square.and.arrow.up" size={24} tintColor={noteText} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={options?.disableActions}
            style={styles.headerPillButton}
            onPress={screen.openSheet}
          >
            <SymbolView name="ellipsis" size={24} tintColor={noteText} />
          </TouchableOpacity>
        </View>
        <HeaderCircleButton
          symbol="checkmark"
          filled={true}
          dark={isDark}
          disabled={options?.disableActions}
          onPress={screen.handleDone}
        />
      </View>
    </View>
  );

  if (screen.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: noteBackground }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
          {renderPageHeader({ disableActions: true })}
          <View style={styles.editorStage}>
            <View style={styles.editorCanvas}>
              <EditorSkeleton dark={isDark} />
            </View>
            <FragmentEditorToolbar
              formattingState={null}
              statusLabel={null}
              isUploadingImage={false}
              isAiRunning={false}
              bottomInset={insets.bottom}
              onCommand={() => undefined}
              onInsertImage={() => undefined}
              onAiAction={() => undefined}
            />
          </View>
        </View>
      </View>
    );
  }

  if (screen.error || !fragment) {
    return (
      <View style={[styles.container, { backgroundColor: noteBackground }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
          {renderPageHeader({ disableActions: true })}
          <View style={styles.editorStage}>
            <ScreenState
              icon="⚠️"
              title="加载失败"
              message={screen.error || '碎片不存在或已被删除'}
              actionLabel="点击重试"
              onAction={() => {
                void screen.reload();
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: noteBackground }]}>
      <Stack.Screen
        options={{
          title: '',
          headerShown: false,
        }}
      />

      <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
        {renderPageHeader()}

        <KeyboardAvoidingView
          style={styles.editorStage}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.editorCanvas}>
            {screen.bodySession.isDraftHydrated ? (
              <FragmentRichEditor
                editorKey={screen.bodySession.editorKey}
                editorRef={screen.bodySession.editorRef}
                initialBodyMarkdown={screen.bodySession.initialBodyMarkdown}
                mediaAssets={screen.bodySession.mediaAssets}
                statusLabel={screen.bodySession.statusLabel}
                onEditorReady={screen.bodySession.onEditorReady}
                onSnapshotChange={screen.bodySession.onSnapshotChange}
                onSelectionChange={screen.bodySession.onSelectionChange}
                onFormattingStateChange={screen.bodySession.onFormattingStateChange}
              />
            ) : (
              <EditorSkeleton dark={isDark} />
            )}
          </View>

          <FragmentEditorToolbar
            formattingState={screen.bodySession.formattingState}
            statusLabel={screen.bodySession.statusLabel}
            isUploadingImage={screen.bodySession.isUploadingImage}
            isAiRunning={screen.bodySession.isAiRunning}
            bottomInset={insets.bottom}
            onCommand={(command) => {
              screen.bodySession.editorRef.current?.runCommand(command);
              screen.bodySession.editorRef.current?.focus();
            }}
            onInsertImage={() => {
              void screen.bodySession.onInsertImage();
            }}
            onAiAction={(instruction) => {
              void screen.bodySession.onAiAction(instruction);
            }}
          />
        </KeyboardAvoidingView>
      </View>

      {screen.isSheetOpen ? (
        <FragmentDetailSheet
          visible={screen.isSheetOpen}
          content={{
            audioFileUrl: fragment.audio_file_url,
            transcript: fragment.transcript,
            speakerSegments: fragment.speaker_segments,
            summary: fragment.summary,
            tags: fragment.tags,
          }}
          metadata={{
            source: fragment.source,
            audioSource: fragment.audio_source ?? null,
            createdAt: fragment.created_at,
            folderName: fragment.folder?.name ?? '未归档',
          }}
          activeSegmentIndex={screen.activeSegmentIndex}
          player={screen.player}
          tools={{
            isUploadingImage: screen.bodySession.isUploadingImage,
            isAiRunning: screen.bodySession.isAiRunning,
            onInsertImage: screen.bodySession.onInsertImage,
            onAiAction: screen.bodySession.onAiAction,
          }}
          actions={{
            isDeleting: screen.isDeleting,
            onClose: screen.closeSheet,
            onDelete: screen.handleDelete,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCircleButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerPill: {
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  headerPillButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorStage: {
    flex: 1,
  },
  editorCanvas: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  skeletonWrap: {
    flex: 1,
    paddingTop: 22,
  },
  skeletonHeading: {
    height: 34,
    borderRadius: 12,
    marginBottom: 34,
  },
  skeletonLine: {
    height: 22,
    borderRadius: 10,
    marginBottom: 18,
  },
  skeletonSpacer: {
    height: 22,
    borderRadius: 10,
    marginTop: 24,
  },
});
