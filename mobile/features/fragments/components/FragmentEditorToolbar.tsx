import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentEditorCommand, FragmentEditorFormattingState } from '@/types/fragment';

type ToolbarAiAction = 'polish';

interface FragmentEditorToolbarProps {
  formattingState: FragmentEditorFormattingState | null;
  statusLabel?: string | null;
  isUploadingImage: boolean;
  isAiRunning: boolean;
  bottomInset: number;
  onCommand: (command: FragmentEditorCommand) => void;
  onInsertImage: () => void;
  onAiAction: (instruction: ToolbarAiAction) => void;
}

interface ToolbarButtonProps {
  label: string;
  symbol?: React.ComponentProps<typeof SymbolView>['name'];
  active?: boolean;
  disabled?: boolean;
  compactText?: boolean;
  onPress: () => void;
}

function ToolbarButton({
  label,
  symbol,
  active = false,
  disabled = false,
  compactText = false,
  onPress,
}: ToolbarButtonProps) {
  /*把编辑命令统一渲染成胶囊按钮，保持底部工具条密度一致。 */
  const theme = useAppTheme();
  const isDark = theme.name === 'dark';

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.toolButton,
        {
          backgroundColor: active ? (isDark ? '#E0BB48' : '#D8B23C') : 'transparent',
          opacity: disabled ? 0.42 : 1,
        },
      ]}
    >
      {symbol ? (
        <SymbolView
          name={symbol}
          size={20}
          tintColor={active ? '#2B2415' : isDark ? '#F7F3ED' : '#23201C'}
        />
      ) : (
        <Text
          style={[
            compactText ? styles.toolCompactText : styles.toolText,
            { color: active ? '#2B2415' : isDark ? '#F7F3ED' : '#23201C' },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function FragmentEditorToolbar({
  formattingState,
  statusLabel,
  isUploadingImage,
  isAiRunning,
  bottomInset,
  onCommand,
  onInsertImage,
  onAiAction,
}: FragmentEditorToolbarProps) {
  /*渲染接近备忘录风格的悬浮工具条，并把格式操作映射到原生按钮。 */
  const theme = useAppTheme();
  const isDark = theme.name === 'dark';
  const titleModeActive = formattingState?.block_type === 'heading';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {statusLabel ? (
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusChip,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' },
            ]}
          >
            <Text style={[styles.statusText, { color: isDark ? '#CFC7BC' : '#80786F' }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.toolbarShell,
          {
            backgroundColor: isDark ? '#1B1916' : '#F4F1EC',
            borderColor: isDark ? '#2A2723' : '#FAF7F2',
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
        >
          <ToolbarButton
            label="Aa"
            active={titleModeActive}
            compactText={true}
            onPress={() => {
              onCommand(titleModeActive ? 'paragraph' : 'heading');
            }}
          />
          <ToolbarButton
            label="列表"
            symbol="list.bullet"
            active={Boolean(formattingState?.bullet_list)}
            onPress={() => onCommand('bulletList')}
          />
          <ToolbarButton
            label="编号"
            symbol="list.number"
            active={Boolean(formattingState?.ordered_list)}
            onPress={() => onCommand('orderedList')}
          />
          <ToolbarButton
            label="引用"
            symbol="text.quote"
            active={Boolean(formattingState?.blockquote)}
            onPress={() => onCommand('blockquote')}
          />
          <ToolbarButton
            label="粗体"
            active={Boolean(formattingState?.bold)}
            onPress={() => onCommand('bold')}
          />
          <ToolbarButton
            label="斜体"
            active={Boolean(formattingState?.italic)}
            onPress={() => onCommand('italic')}
          />
          <ToolbarButton
            label="图片"
            symbol="paperclip"
            disabled={isUploadingImage}
            onPress={onInsertImage}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  statusRow: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  toolbarShell: {
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#1E1913',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  toolbarContent: {
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  toolButton: {
    minWidth: 52,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  toolText: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '700',
  },
  toolCompactText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: -0.6,
  },
});
