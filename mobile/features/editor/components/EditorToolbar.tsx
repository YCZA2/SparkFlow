import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import type {
  EditorCapabilities,
  EditorCommand,
  EditorFormattingState,
} from '@/features/editor/types';
import { useAppTheme } from '@/theme/useAppTheme';

interface EditorToolbarProps {
  capabilities: EditorCapabilities;
  formattingState: EditorFormattingState | null;
  statusLabel?: string | null;
  isUploadingImage: boolean;
  bottomInset: number;
  onCommand: (command: EditorCommand) => void;
  onInsertImage?: () => void;
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
          backgroundColor: active
            ? isDark
              ? '#3B3320'
              : '#FFF3C4'
            : 'transparent',
          opacity: disabled ? 0.42 : 1,
        },
      ]}
    >
      {symbol ? (
        <SymbolView
          name={symbol}
          size={20}
          tintColor={active ? '#C88A00' : isDark ? '#F7F3ED' : '#23201C'}
        />
      ) : (
        <Text
          style={[
            compactText ? styles.toolCompactText : styles.toolText,
            { color: active ? '#C88A00' : isDark ? '#F7F3ED' : '#23201C' },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function EditorToolbar({
  capabilities,
  formattingState,
  statusLabel,
  isUploadingImage,
  bottomInset,
  onCommand,
  onInsertImage,
}: EditorToolbarProps) {
  /*渲染共享悬浮工具条，并按能力开关裁剪按钮集合。 */
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
            backgroundColor: isDark ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.96)',
            borderColor: isDark ? '#2A2723' : '#E7E3DC',
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
        >
          {capabilities.supportsTitle ? (
            <ToolbarButton
              label="Aa"
              active={titleModeActive}
              compactText={true}
              onPress={() => {
                onCommand(titleModeActive ? 'paragraph' : 'heading');
              }}
            />
          ) : null}
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
          {capabilities.supportsImages ? (
            <ToolbarButton
              label="图片"
              symbol="paperclip"
              disabled={isUploadingImage}
              onPress={() => {
                onInsertImage?.();
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
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
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  toolbarContent: {
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  toolButton: {
    minWidth: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
