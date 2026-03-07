import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const summary = getCleanText(fragment.summary);
  if (summary) return truncate(summary, 30);

  const transcript = getCleanText(fragment.transcript);
  if (transcript) return truncate(transcript, 30);

  return '无标题灵感';
}

function getPreview(fragment: Fragment): string {
  const transcript = getCleanText(fragment.transcript);
  const summary = getCleanText(fragment.summary);

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

  return (
    <TouchableOpacity
      style={[
        styles.container,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: isFirstInSection ? 26 : 0,
          borderTopRightRadius: isFirstInSection ? 26 : 0,
          borderBottomLeftRadius: isLastInSection ? 26 : 0,
          borderBottomRightRadius: isLastInSection ? 26 : 0,
          borderTopWidth: isFirstInSection ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
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

        <Text style={[styles.source, { color: theme.colors.textSubtle }]} numberOfLines={1}>
          {getSourceLabel(fragment.source)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 2,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  content: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    fontSize: 15,
    minWidth: 44,
  },
  preview: {
    flex: 1,
    fontSize: 15,
  },
  source: {
    fontSize: 14,
    lineHeight: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
