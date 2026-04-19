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
      className="mx-sf-screen px-sf-screen py-sf-md bg-app-surface dark:bg-app-surface-dark"
      style={[
        {
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
      <View className="flex-row items-center gap-sf-sm">
        <Text
          className="flex-1 text-[17px] font-medium leading-[22px] text-app-text dark:text-app-text-dark"
          numberOfLines={1}
        >
          {displayTitle}
        </Text>
        <Text className="text-[22px] font-light leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
          ›
        </Text>
      </View>

      <Text className="mt-[2px] text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
        {script.created_at ? formatDate(script.created_at) : '刚刚更新'}
      </Text>

      {previewText ? (
        <Text
          className="mt-[2px] text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark"
          numberOfLines={2}
        >
          {previewText}
        </Text>
      ) : null}

      <View className="mt-[10px]">
        <View className="flex-row flex-wrap gap-[6px]">
          <View className="rounded-sf-pill px-sf-sm py-[5px]" style={{ backgroundColor: modeColor + '18' }}>
            <Text className="text-xs font-medium" style={{ color: modeColor }}>
              {modeLabel}
            </Text>
          </View>
          {script.is_daily_push && (
            <View
              className="rounded-sf-pill px-sf-sm py-[5px]"
              style={{ backgroundColor: `${theme.colors.warning}18` }}
            >
              <Text className="text-xs font-medium" style={{ color: theme.colors.warning }}>
                每日推盘
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
