/**
 * 口播稿卡片组件
 * 用于口播稿列表页展示
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import type { Script, ScriptMode } from '@/types/script';
import {
  extractPlainTextFromHtml,
  extractPreviewSkippingTitle,
  extractTitleFromFirstLine,
} from '@/features/editor/html';
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
function getModeColor(mode: ScriptMode, colors: { warning: string; primary: string }): string {
  if (mode === 'mode_daily_push') return colors.warning;
  return colors.primary;
}

interface ScriptCardProps {
  script: Script;
  onPress: (script: Script) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function ScriptCard({ script, onPress, isFirst = false, isLast = false }: ScriptCardProps) {
  const theme = useAppTheme();

  // 优先从首行提取标题，实现"首行即标题"的产品体验
  const titleFromFirstLine = extractTitleFromFirstLine(script.body_html ?? '', 50);
  const displayTitle = titleFromFirstLine || script.title || '无标题口播稿';

  // 从正文提取预览（跳过首行标题），避免标题和预览重复
  const previewText = extractPreviewSkippingTitle(script.body_html ?? '', 100);
  const modeLabel = getModeLabel(script.mode);
  const modeColor = getModeColor(script.mode, theme.colors);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: isFirst ? 18 : 0,
          borderTopRightRadius: isFirst ? 18 : 0,
          borderBottomLeftRadius: isLast ? 18 : 0,
          borderBottomRightRadius: isLast ? 18 : 0,
          marginTop: isFirst ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onPress(script)}
      activeOpacity={0.7}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {displayTitle}
        </Text>
        <Text style={[styles.chevron, { color: theme.colors.textSubtle }]}>›</Text>
      </View>

      <Text style={[styles.timeInline, { color: theme.colors.textSubtle }]}>
        {script.created_at ? formatDate(script.created_at) : '刚刚更新'}
      </Text>

      {previewText ? (
        <Text style={[styles.preview, { color: theme.colors.textSubtle }]} numberOfLines={2}>
          {previewText}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: modeColor + '18' }]}>
            <Text style={[styles.tagText, { color: modeColor }]}>{modeLabel}</Text>
          </View>
          {script.is_daily_push && (
            <View style={[styles.tag, { backgroundColor: `${theme.colors.warning}18` }]}>
              <Text style={[styles.tagText, { color: theme.colors.warning }]}>每日推盘</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 22,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '300',
  },
  timeInline: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  footerRow: {
    marginTop: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
