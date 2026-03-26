import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  isFailedMediaIngestionFragment,
  isProcessingMediaIngestionFragment,
} from '@/features/pipelines/mediaIngestionRecoveryState';
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
  if (isFailedMediaIngestionFragment(fragment)) {
    return '转录失败';
  }

  if (isProcessingMediaIngestionFragment(fragment)) {
    return '转录中...';
  }

  const summary = getCleanText(fragment.summary);
  if (summary) return truncate(summary, 30);

  const body = getCleanText(fragment.plain_text_snapshot);
  if (body) return truncate(body, 30);

  const transcript = getCleanText(fragment.transcript);
  if (transcript) return truncate(transcript, 30);

  return '无标题灵感';
}

function getPreview(fragment: Fragment): string {
  if (isFailedMediaIngestionFragment(fragment)) {
    return truncate(getCleanText(fragment.media_pipeline_error_message) || '下拉刷新后会自动重试', 42);
  }

  if (isProcessingMediaIngestionFragment(fragment)) {
    return '正在提取正文';
  }

  const body = getCleanText(fragment.plain_text_snapshot);
  const transcript = getCleanText(fragment.transcript);
  const summary = getCleanText(fragment.summary);

  if (body) return truncate(body, 42);

  if (summary && transcript && summary !== transcript) {
    return truncate(transcript, 42);
  }

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
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
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
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {getTitle(fragment)}
          </Text>
          {!selectable ? (
            <Text style={[styles.countChevron, { color: theme.colors.textSubtle }]}>›</Text>
          ) : null}
          {selectable ? (
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                },
              ]}
            >
              {selected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: theme.colors.textSubtle }]}>
            {formatTimeLabel(fragment.created_at)}
          </Text>
          <Text style={[styles.preview, { color: theme.colors.textSubtle }]} numberOfLines={1}>
            {getPreview(fragment)}
          </Text>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.source, { color: theme.colors.textSubtle }]} numberOfLines={1}>
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

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  countChevron: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '300',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  time: {
    fontSize: 13,
    minWidth: 40,
    color: '#8E8E93',
  },
  preview: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
  },
  source: {
    fontSize: 12,
    lineHeight: 16,
    color: '#C7C7CC',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
