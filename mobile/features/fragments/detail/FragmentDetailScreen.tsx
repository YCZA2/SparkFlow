import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { type Href, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { FragmentDetailSheet } from '@/features/fragments/components/FragmentDetailSheet';
import { FragmentEditorToolbar } from '@/features/fragments/components/FragmentEditorToolbar';
import { FragmentRichEditor } from '@/features/fragments/components/FragmentRichEditor';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentEditorCommand } from '@/types/fragment';

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
  /*统一顶部圆形操作按钮，保持详情页主视图的备忘录式视觉密度。 */
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
  /*在详情资源或 DOM 编辑器未就绪时渲染纸张骨架，减少首屏空白感。 */
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
  editorRef: React.RefObject<{
    runCommand?: (command: FragmentEditorCommand) => void;
    focus?: () => void;
  } | null>,
  command: FragmentEditorCommand,
  options?: { focus?: boolean }
) {
  /*bridge 方法尚未挂载时跳过命令，避免详情页初始化阶段抛错。 */
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

export function FragmentDetailScreen({
  fragmentId,
  exitTo,
}: {
  fragmentId?: string | null;
  exitTo?: Href | null;
}) {
  /*只消费 screen view-model 渲染碎片详情页面，避免页面层混入保存流程细节。 */
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const screen = useFragmentDetailScreen(fragmentId, { exitTo });
  const fragment = screen.resource.fragment;
  const editor = screen.editor;
  const sheet = screen.sheet;
  const actions = screen.actions;
  const isDark = theme.name === 'dark';
  const noteBackground = isDark ? '#12110F' : '#ECE9E4';
  const noteText = isDark ? '#F7F3ED' : '#23201C';
  const chromePill = isDark ? '#181715' : '#F1EEEA';

  const renderPageHeader = (options?: { disableActions?: boolean }) => (
    <View style={styles.headerRow}>
      <HeaderCircleButton symbol="chevron.left" dark={isDark} onPress={actions.goBack} />

      <View style={styles.headerActions}>
        <HeaderCircleButton
          symbol="arrow.uturn.backward"
          dark={isDark}
          disabled={options?.disableActions || !editor.formattingState?.can_undo}
          onPress={() => runEditorCommand(editor.editorRef, 'undo')}
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
              void actions.share();
            }}
          >
            <SymbolView name="square.and.arrow.up" size={24} tintColor={noteText} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={options?.disableActions}
            style={styles.headerPillButton}
            onPress={sheet.open}
          >
            <SymbolView name="ellipsis" size={24} tintColor={noteText} />
          </TouchableOpacity>
        </View>
        <HeaderCircleButton
          symbol="checkmark"
          filled={true}
          dark={isDark}
          disabled={options?.disableActions}
          onPress={actions.done}
        />
      </View>
    </View>
  );

  if (screen.resource.isLoading) {
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

  if (screen.resource.error || !fragment) {
    return (
      <View style={[styles.container, { backgroundColor: noteBackground }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={[styles.page, { paddingTop: insets.top + 10 }]}>
          {renderPageHeader({ disableActions: true })}
          <View style={styles.editorStage}>
            <ScreenState
              icon="⚠️"
              title="加载失败"
              message={screen.resource.error || '碎片不存在或已被删除'}
              actionLabel="点击重试"
              onAction={() => {
                void screen.resource.reload();
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
            {editor.isDraftHydrated ? (
              <FragmentRichEditor
                editorKey={editor.editorKey}
                editorRef={editor.editorRef}
                initialBodyMarkdown={editor.initialBodyMarkdown}
                mediaAssets={editor.mediaAssets}
                statusLabel={editor.statusLabel}
                onEditorReady={editor.onEditorReady}
                onSnapshotChange={editor.onSnapshotChange}
                onSelectionChange={editor.onSelectionChange}
                onFormattingStateChange={editor.onFormattingStateChange}
              />
            ) : (
              <EditorSkeleton dark={isDark} />
            )}
          </View>

          <FragmentEditorToolbar
            formattingState={editor.formattingState}
            statusLabel={editor.statusLabel}
            isUploadingImage={editor.isUploadingImage}
            isAiRunning={editor.isAiRunning}
            bottomInset={insets.bottom}
            onCommand={(command) => {
              runEditorCommand(editor.editorRef, command, { focus: true });
            }}
            onInsertImage={() => {
              void editor.onInsertImage();
            }}
            onAiAction={(instruction) => {
              void editor.onAiAction(instruction);
            }}
          />
        </KeyboardAvoidingView>
      </View>

      {sheet.isOpen && sheet.content && sheet.metadata ? (
        <FragmentDetailSheet
          visible={sheet.isOpen}
          content={sheet.content}
          metadata={sheet.metadata}
          activeSegmentIndex={sheet.activeSegmentIndex}
          player={sheet.player}
          tools={sheet.tools}
          actions={sheet.actions}
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
