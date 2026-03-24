/**
 * 口播稿卡片组件
 * 用于口播稿列表页展示
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import type { Script, ScriptMode } from '@/types/script';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import { formatDate } from '@/utils/date';
import { useAppTheme } from '@/theme/useAppTheme';

/**
 * 获取模式标签
 */
function getModeLabel(mode: ScriptMode): string {
  if (mode === 'mode_daily_push') return '每日推盘';
  return '主题生成';
}

/**
 * 获取模式颜色
 */
function getModeColor(mode: ScriptMode): string {
  if (mode === 'mode_daily_push') return 'warning';
  return 'primary';
}

interface ScriptCardProps {
  script: Script;
  onPress: (script: Script) => void;
}

export function ScriptCard({ script, onPress }: ScriptCardProps) {
  const theme = useAppTheme();

  // 显示标题或内容前50字
  const displayTitle =
    script.title ||
    extractPlainTextFromHtml(script.body_html ?? '').slice(0, 50) ||
    '无标题口播稿';
  const previewText = extractPlainTextFromHtml(script.body_html ?? '').trim();
  const modeLabel = getModeLabel(script.mode);
  const modeColorToken = getModeColor(script.mode);
  const modeColor =
    modeColorToken === 'danger'
      ? theme.colors.danger
      : modeColorToken === 'warning'
        ? theme.colors.warning
        : theme.colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        theme.shadow.card,
        { backgroundColor: theme.colors.surface },
      ]}
      onPress={() => onPress(script)}
      activeOpacity={0.7}
    >
      {/* 标题 */}
      <Text
        style={[styles.title, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {displayTitle}
      </Text>

      {previewText ? (
        <Text
          style={[styles.preview, { color: theme.colors.textSubtle }]}
          numberOfLines={3}
        >
          {previewText}
        </Text>
      ) : null}

      {/* 标签行 */}
      <View style={styles.tagsRow}>
        {/* 模式标签 */}
        <View style={[styles.tag, { backgroundColor: modeColor + '20' }]}>
          <Text style={[styles.tagText, { color: modeColor }]}>{modeLabel}</Text>
        </View>

        {/* 每日推盘标记 */}
        {script.is_daily_push && (
          <View style={[styles.tag, { backgroundColor: `${theme.colors.warning}20` }]}>
            <Text style={[styles.tagText, { color: theme.colors.warning }]}>每日推盘</Text>
          </View>
        )}
      </View>

      {/* 时间 */}
      {script.created_at && (
          <Text style={[styles.time, { color: theme.colors.textSubtle }]}>
            {formatDate(script.created_at)}
          </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  preview: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  time: {
    fontSize: 12,
  },
});
