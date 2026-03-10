import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface FragmentBodyEditorProps {
  value: string;
  statusLabel?: string | null;
  onChangeText: (value: string) => void;
}

export function FragmentBodyEditor({ value, statusLabel, onChangeText }: FragmentBodyEditorProps) {
  /** 中文注释：展示正文编辑区与轻量同步状态，不覆盖转写原文卡片。 */
  const theme = useAppTheme();

  return (
    <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>整理正文</Text>
        {statusLabel ? (
          <Text style={[styles.statusText, { color: theme.colors.textSubtle }]}>{statusLabel}</Text>
        ) : null}
      </View>
      <Text style={[styles.hintText, { color: theme.colors.textSubtle }]}>
        这里编辑的是正文，不会覆盖语音原文。
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="整理成更适合后续生成和复用的版本"
        placeholderTextColor={theme.colors.textSubtle}
        multiline
        textAlignVertical="top"
        style={[styles.input, { color: theme.colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  input: {
    minHeight: 180,
    fontSize: 15,
    lineHeight: 24,
  },
});
