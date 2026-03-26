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

import { BackButton } from '@/components/layout/BackButton';
import { ScreenState } from '@/components/ScreenState';
import { EditorToolbar } from '@/features/editor/components/EditorToolbar';
import type {
  EditorCapabilities,
  EditorCommand,
  EditorFormattingState,
  EditorSurfaceHandle,
} from '@/features/editor/types';
import { useAppTheme } from '@/theme/useAppTheme';

function supportsNativeFormattingMenu() {
  /*原生格式菜单仅在 Android 和 iOS 16+ 可用，其余平台继续走页面内兜底工具条。 */
  if (Platform.OS === 'android') return true;
  if (Platform.OS !== 'ios') return false;
  const version =
    typeof Platform.Version === 'string'
      ? Number.parseInt(Platform.Version, 10)
      : Platform.Version;
  return Number.isFinite(version) && version >= 16;
}

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
  /*统一顶部圆形操作按钮，保持编辑页主视图的备忘录式视觉密度。 */
  const backgroundColor = filled
    ? '#FFF3C4'
    : dark
      ? 'rgba(28,28,30,0.96)'
      : 'rgba(255,255,255,0.92)';
  const borderColor = filled ? '#F2DD8C' : dark ? '#2A2723' : '#E7E3DC';
  const tintColor = filled ? '#C88A00' : dark ? '#F7F3ED' : '#23201C';

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
  /*在资源或正文编辑器未就绪时渲染纸张骨架，减少首屏空白感。 */
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

function runEditorCommand(
  editorRef: React.RefObject<EditorSurfaceHandle | null>,
  command: EditorCommand,
  options?: { focus?: boolean }
) {
  /*bridge 方法尚未挂载时跳过命令，避免编辑器初始化阶段抛错。 */
  const runCommand = editorRef.current?.runCommand;
  if (typeof runCommand !== 'function') return;
  runCommand(command);
  if (options?.focus) {
    const focus = editorRef.current?.focus;
    if (typeof focus === 'function') {
      focus();
    }
  }
}

interface ContentEditorScaffoldProps {
  capabilities: EditorCapabilities;
  isLoading: boolean;
  error: string | null;
  isDraftHydrated: boolean;
  formattingState: EditorFormattingState | null;
  statusLabel?: string | null;
  isUploadingImage?: boolean;
  editorRef: React.RefObject<EditorSurfaceHandle | null>;
  onBack: () => void | Promise<void>;
  onDone: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onShare?: (() => void | Promise<void>) | null;
  onOpenDetailSheet?: (() => void | Promise<void>) | null;
  onInsertImage?: (() => void | Promise<void>) | null;
  editor: React.ReactNode;
  topContent?: React.ReactNode;
  bottomAccessory?: React.ReactNode;
}

export function ContentEditorScaffold({
  capabilities,
  isLoading,
  error,
  isDraftHydrated,
  formattingState,
  statusLabel,
  isUploadingImage = false,
  editorRef,
  onBack,
  onDone,
  onRetry,
  onShare,
  onOpenDetailSheet,
  onInsertImage,
  editor,
  topContent,
  bottomAccessory,
}: ContentEditorScaffoldProps) {
  /*统一渲染编辑页壳层，页面层只需提供资源态和文档能力。 */
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.name === 'dark';
  const noteBackground = isDark ? '#111113' : '#F2F2F7';
  const noteText = isDark ? '#F7F3ED' : '#1C1C1E';
  const chromePill = isDark ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.92)';
  const useNativeFormattingMenu = supportsNativeFormattingMenu();
  const hasHeaderPill = Boolean(onShare || onOpenDetailSheet);

  const renderPageHeader = (options?: { disableActions?: boolean }) => (
    <View style={styles.headerRow}>
      <BackButton onPress={onBack} variant="circle" showText={false} />

      <View style={styles.headerActions}>
        <HeaderCircleButton
          symbol="arrow.uturn.backward"
          dark={isDark}
          disabled={options?.disableActions || !formattingState?.can_undo}
          onPress={() => runEditorCommand(editorRef, 'undo')}
        />
        {hasHeaderPill ? (
          <View
            style={[
              styles.headerPill,
              {
                backgroundColor: chromePill,
                borderColor: isDark ? '#2A2723' : '#E7E3DC',
                opacity: options?.disableActions ? 0.55 : 1,
              },
            ]}
          >
            {onShare ? (
              <TouchableOpacity
                activeOpacity={0.86}
                disabled={options?.disableActions}
                style={styles.headerPillButton}
                onPress={() => {
                  void onShare();
                }}
              >
                <SymbolView name="square.and.arrow.up" size={24} tintColor={noteText} />
              </TouchableOpacity>
            ) : null}
            {onOpenDetailSheet ? (
              <TouchableOpacity
                activeOpacity={0.86}
                disabled={options?.disableActions}
                style={styles.headerPillButton}
                onPress={() => {
                  void onOpenDetailSheet();
                }}
              >
                <SymbolView name="ellipsis" size={24} tintColor={noteText} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <HeaderCircleButton
          symbol="checkmark"
          filled={true}
          dark={isDark}
          disabled={options?.disableActions}
          onPress={onDone}
        />
      </View>
    </View>
  );

  const renderToolbar = (disabled: boolean) => {
    if (useNativeFormattingMenu) return null;
    return (
      <EditorToolbar
        capabilities={capabilities}
        formattingState={formattingState}
        statusLabel={statusLabel}
        isUploadingImage={disabled ? false : isUploadingImage}
        bottomInset={insets.bottom}
        onCommand={(command) => {
          if (disabled) return;
          runEditorCommand(editorRef, command, { focus: true });
        }}
        onInsertImage={
          disabled || !onInsertImage
            ? undefined
            : () => {
                void onInsertImage();
              }
        }
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: noteBackground }]}>
      <Stack.Screen
        options={{
          title: '',
          headerShown: false,
        }}
      />

      <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
        {renderPageHeader({ disableActions: isLoading || Boolean(error) })}
        {topContent ? <View style={styles.topContent}>{topContent}</View> : null}

        <KeyboardAvoidingView
          style={styles.editorStage}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.editorCanvas}>
            {isLoading ? (
              <EditorSkeleton dark={isDark} />
            ) : error ? (
              <ScreenState
                icon="⚠️"
                title="加载失败"
                message={error}
                actionLabel="点击重试"
                onAction={() => {
                  void onRetry();
                }}
              />
            ) : isDraftHydrated ? (
              editor
            ) : (
              <EditorSkeleton dark={isDark} />
            )}
          </View>

          {renderToolbar(Boolean(isLoading || error))}
          {bottomAccessory ? (
            <View
              style={[
                styles.bottomAccessory,
                { paddingBottom: useNativeFormattingMenu ? Math.max(insets.bottom, 12) : 12 },
              ]}
            >
              {bottomAccessory}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerPill: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  headerPillButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topContent: {
    marginBottom: 14,
  },
  editorStage: {
    flex: 1,
  },
  editorCanvas: {
    flex: 1,
    paddingHorizontal: 2,
    paddingTop: 6,
  },
  bottomAccessory: {
    paddingHorizontal: 18,
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
    marginTop: 16,
  },
});
