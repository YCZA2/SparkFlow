import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { FragmentDetailSheet } from '@/features/fragments/components/FragmentDetailSheet';
import { FragmentRichEditor } from '@/features/fragments/components/FragmentRichEditor';
import { FragmentEditorToolbar } from '@/features/fragments/components/FragmentEditorToolbar';
import { deleteFragment } from '@/features/fragments/api';
import { clearFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { useFragmentDetail } from '@/features/fragments/hooks/useFragmentDetail';
import { useFragmentRichEditor } from '@/features/fragments/hooks/useFragmentRichEditor';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { removeFragmentCache } from '@/features/fragments/fragmentRepository';
import { useAppTheme } from '@/theme/useAppTheme';

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
  /** 中文注释：统一顶部圆形操作按钮，贴近备忘录式轻编辑页面的交互形态。 */
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
  /** 中文注释：在 fragment 和 DOM 编辑器尚未就绪时先渲染备忘录式骨架，减少网页感的空白等待。 */
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

export default function FragmentDetailScreen() {
  /** 中文注释：把碎片详情页收敛为编辑器主视图，其余内容统一进入底部抽屉。 */
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const detail = useFragmentDetail(id ?? null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const fragment = detail.fragment;

  const player = useFragmentAudioPlayer(fragment?.audio_file_url, { enabled: isSheetOpen });
  const activeSegmentIndex = useMemo(() => {
    if (!isSheetOpen) {
      return null;
    }
    const segments = fragment?.speaker_segments;
    if (!segments?.length) {
      return null;
    }
    return getActiveSegmentIndex(segments, player.positionMs);
  }, [fragment?.speaker_segments, isSheetOpen, player.positionMs]);
  const bodyEditor = useFragmentRichEditor({
    fragmentId: id ?? null,
    fragment,
    onFragmentChange: detail.setFragment,
  });
  const isDark = theme.name === 'dark';
  const noteBackground = isDark ? '#12110F' : '#ECE9E4';
  const noteText = isDark ? '#F7F3ED' : '#23201C';
  const chromePill = isDark ? '#181715' : '#F1EEEA';

  const renderPageHeader = (options?: { disableActions?: boolean }) => (
    <View style={styles.headerRow}>
      <HeaderCircleButton symbol="chevron.left" dark={isDark} onPress={() => router.back()} />

      <View style={styles.headerActions}>
        <HeaderCircleButton
          symbol="arrow.uturn.backward"
          dark={isDark}
          disabled={options?.disableActions || !bodyEditor.formattingState?.can_undo}
          onPress={() => bodyEditor.editorRef.current?.runCommand('undo')}
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
              void handleShare();
            }}
          >
            <SymbolView name="square.and.arrow.up" size={24} tintColor={noteText} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={options?.disableActions}
            style={styles.headerPillButton}
            onPress={() => setIsSheetOpen(true)}
          >
            <SymbolView name="ellipsis" size={24} tintColor={noteText} />
          </TouchableOpacity>
        </View>
        <HeaderCircleButton
          symbol="checkmark"
          filled={true}
          dark={isDark}
          disabled={options?.disableActions}
          onPress={handleDone}
        />
      </View>
    </View>
  );

  const confirmDelete = async () => {
    if (!id) return;

    try {
      setIsDeleting(true);
      await deleteFragment(id);
      await Promise.all([removeFragmentCache(id), clearFragmentBodyDraft(id)]);
      setIsSheetOpen(false);
      router.replace({
        pathname: '/',
        params: { refresh: 'true' },
      });
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('删除后将无法恢复，是否继续？')) {
        void confirmDelete();
      }
      return;
    }

    Alert.alert('确认删除', '删除后将无法恢复，是否继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  const handleShare = async () => {
    /** 中文注释：分享时优先读取编辑器最新快照，避免 debounce 导致导出的正文落后。 */
    const latestSnapshot = bodyEditor.editorRef.current?.getSnapshot();
    const shareText = latestSnapshot?.plain_text || fragment?.plain_text_snapshot || '';
    if (!shareText.trim()) {
      Alert.alert('暂无可分享内容', '先写一点正文再分享。');
      return;
    }
    await Share.share({
      message: shareText,
    });
  };

  const handleDone = async () => {
    /** 中文注释：完成编辑前主动 flush 一次保存，降低刚输入内容未落库的风险。 */
    try {
      await bodyEditor.saveNow();
      router.back();
    } catch {
      Alert.alert('内容未同步', '内容未同步，已保留本地草稿');
    }
  };

  if (detail.isLoading) {
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

  if (detail.error || !fragment) {
    return (
      <View style={[styles.container, { backgroundColor: noteBackground }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
          {renderPageHeader({ disableActions: true })}
          <View style={styles.editorStage}>
            <ScreenState
              icon="⚠️"
              title="加载失败"
              message={detail.error || '碎片不存在或已被删除'}
              actionLabel="点击重试"
              onAction={() => {
                void detail.reload();
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
            {bodyEditor.isDraftHydrated ? (
              <FragmentRichEditor
                editorKey={bodyEditor.editorKey}
                editorRef={bodyEditor.editorRef}
                initialBodyMarkdown={bodyEditor.initialBodyMarkdown}
                mediaAssets={bodyEditor.mediaAssets}
                statusLabel={bodyEditor.statusLabel}
                onEditorReady={bodyEditor.onEditorReady}
                onSnapshotChange={bodyEditor.onSnapshotChange}
                onSelectionChange={bodyEditor.onSelectionChange}
                onFormattingStateChange={bodyEditor.onFormattingStateChange}
              />
            ) : (
              <EditorSkeleton dark={isDark} />
            )}
          </View>

          <FragmentEditorToolbar
            formattingState={bodyEditor.formattingState}
            statusLabel={bodyEditor.statusLabel}
            isUploadingImage={bodyEditor.isUploadingImage}
            isAiRunning={bodyEditor.isAiRunning}
            bottomInset={insets.bottom}
            onCommand={(command) => {
              bodyEditor.editorRef.current?.runCommand(command);
              bodyEditor.editorRef.current?.focus();
            }}
            onInsertImage={() => {
              void bodyEditor.onInsertImage();
            }}
            onAiAction={(instruction) => {
              void bodyEditor.onAiAction(instruction);
            }}
          />
        </KeyboardAvoidingView>
      </View>

      {isSheetOpen ? (
        <FragmentDetailSheet
          visible={isSheetOpen}
          fragment={fragment}
          isDeleting={isDeleting}
          isUploadingImage={bodyEditor.isUploadingImage}
          isAiRunning={bodyEditor.isAiRunning}
          activeSegmentIndex={activeSegmentIndex}
          player={player}
          onClose={() => setIsSheetOpen(false)}
          onDelete={handleDelete}
          onInsertImage={bodyEditor.onInsertImage}
          onAiAction={bodyEditor.onAiAction}
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
  stateContainer: {
    flex: 1,
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
