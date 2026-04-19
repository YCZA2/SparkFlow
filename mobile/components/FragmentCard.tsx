import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  isFailedMediaIngestionFragment,
  isProcessingMediaIngestionFragment,
} from '@/features/tasks/mediaIngestionTaskRecoveryState';
import {
  extractPreviewSkippingTitle,
  extractTitleFromFirstLine,
} from '@/features/editor/html';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';

interface FragmentCardProps {
  fragment: Fragment;
  onPress?: (fragment: Fragment) => void;
  selectable?: boolean;
  selected?: boolean;
  isFirstInSection?: boolean;
  isLastInSection?: boolean;
}

function formatTimeLabel(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getCleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音记录',
    manual: '文字记录',
    video_parse: '视频解析',
  };

  return labels[source] || source;
}

function getTitle(fragment: Fragment): string {
  /*优先从首行提取标题，实现"首行即标题"的产品体验。 */
  if (isFailedMediaIngestionFragment(fragment)) {
    return '转录失败';
  }

  if (isProcessingMediaIngestionFragment(fragment)) {
    return '转录中...';
  }

  // 优先从 body_html 首行提取标题
  const titleFromFirstLine = extractTitleFromFirstLine(fragment.body_html, 30);
  if (titleFromFirstLine) return titleFromFirstLine;

  // 兜底：从 plain_text_snapshot 首行提取
  const plainTitle = getCleanText(fragment.plain_text_snapshot);
  if (plainTitle) return truncate(plainTitle, 30);

  // 兜底：从 transcript 首行提取
  const transcriptTitle = getCleanText(fragment.transcript);
  if (transcriptTitle) return truncate(transcriptTitle, 30);

  // 兜底：从 summary 提取
  const summaryTitle = getCleanText(fragment.summary);
  if (summaryTitle) return truncate(summaryTitle, 30);

  return '无标题灵感';
}

function getPreview(fragment: Fragment): string {
  /*从正文提取预览（跳过首行标题），避免标题和预览重复。 */
  if (isFailedMediaIngestionFragment(fragment)) {
    return truncate(getCleanText(fragment.media_pipeline_error_message) || '下拉刷新后会自动重试', 42);
  }

  if (isProcessingMediaIngestionFragment(fragment)) {
    return '正在提取正文';
  }

  // 优先从 body_html 提取预览（跳过首行）
  const previewFromBody = extractPreviewSkippingTitle(fragment.body_html, 42);
  if (previewFromBody) return previewFromBody;

  // 兜底：使用 transcript
  const transcript = getCleanText(fragment.transcript);
  const summary = getCleanText(fragment.summary);

  if (transcript) return truncate(transcript, 42);
  if (summary) return truncate(summary, 42);

  return '暂无更多文本';
}

export function FragmentCard({
  fragment,
  onPress,
  selectable = false,
  selected = false,
  isFirstInSection = false,
  isLastInSection = false,
}: FragmentCardProps) {
  const theme = useAppTheme();
  const isProcessing = isProcessingMediaIngestionFragment(fragment);
  const isFailed = isFailedMediaIngestionFragment(fragment);

  return (
    <TouchableOpacity
      className="mx-sf-screen px-sf-screen py-sf-md bg-app-surface dark:bg-app-surface-dark"
      style={[
        {
          borderTopLeftRadius: isFirstInSection ? 18 : 0,
          borderTopRightRadius: isFirstInSection ? 18 : 0,
          borderBottomLeftRadius: isLastInSection ? 18 : 0,
          borderBottomRightRadius: isLastInSection ? 18 : 0,
          marginTop: isFirstInSection ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onPress?.(fragment)}
      activeOpacity={0.82}
    >
      <View className="gap-[2px]">
        <View className="flex-row items-center gap-sf-md">
          <Text
            className="flex-1 text-[17px] font-medium leading-[22px] text-app-text dark:text-app-text-dark"
            numberOfLines={1}
          >
            {getTitle(fragment)}
          </Text>
          {!selectable ? (
            <Text className="text-[22px] font-light leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
              ›
            </Text>
          ) : null}
          {selectable ? (
            <View
              className="h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px]"
              style={[
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                },
              ]}
            >
              {selected ? <Text className="text-[11px] font-bold text-white">✓</Text> : null}
            </View>
          ) : null}
        </View>

        <View className="mt-[2px] flex-row items-center gap-[6px]">
          <Text className="min-w-10 text-[13px] text-app-text-subtle dark:text-app-text-subtle-dark">
            {formatTimeLabel(fragment.created_at)}
          </Text>
          <Text
            className="flex-1 text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark"
            numberOfLines={1}
          >
            {getPreview(fragment)}
          </Text>
        </View>

        <View className="flex-row items-center gap-sf-sm">
          <Text
            className="text-xs leading-4 text-app-text-subtle dark:text-app-text-subtle-dark"
            numberOfLines={1}
          >
            {isFailed
              ? `${getSourceLabel(fragment.source)} · 转录失败`
              : isProcessing
                ? `${getSourceLabel(fragment.source)} · 转录中`
                : getSourceLabel(fragment.source)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
