/**
 * 碎片卡片组件
 * 展示单个碎片笔记的摘要信息
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { formatDate } from '@/utils/date';
import type { Fragment } from '@/types/fragment';
import { useAppTheme } from '@/theme/useAppTheme';

// 卡片组件属性
interface FragmentCardProps {
  /** 碎片数据 */
  fragment: Fragment;
  /** 点击回调 */
  onPress?: (fragment: Fragment) => void;
  /** 是否显示多选框 */
  selectable?: boolean;
  /** 当前是否已选中 */
  selected?: boolean;
}

/**
 * 获取卡片显示文本
 * 优先使用 summary，否则使用 transcript 前50字符
 */
function getDisplayText(fragment: Fragment): string {
  if (fragment.summary) {
    return fragment.summary;
  }
  if (fragment.transcript) {
    return fragment.transcript.length > 50
      ? fragment.transcript.slice(0, 50) + '...'
      : fragment.transcript;
  }
  return '无内容';
}

/**
 * 碎片卡片组件
 */
export function FragmentCard({
  fragment,
  onPress,
  selectable = false,
  selected = false,
}: FragmentCardProps) {
  const theme = useAppTheme();

  const displayText = getDisplayText(fragment);
  const timeText = formatDate(fragment.created_at);
  // 解析标签：支持 JSON 数组字符串或逗号分隔字符串
  const tags: string[] = parseTags(fragment.tags);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        [theme.shadow.card, { backgroundColor: theme.colors.surface }],
      ]}
      onPress={() => onPress?.(fragment)}
      activeOpacity={0.7}
    >
      <View style={styles.mainRow}>
        {selectable && (
          <View
            style={[
              styles.checkbox,
              {
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            {selected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}

        {/* 主内容区域 */}
        <View style={styles.content}>
          <Text
            style={[
              styles.text,
              { color: theme.colors.text },
            ]}
            numberOfLines={2}
          >
            {displayText}
          </Text>
        </View>
      </View>

      {/* 标签区域 */}
      {tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {tags.slice(0, 3).map((tag, index) => (
            <View
              key={index}
              style={[
                styles.tag,
                { backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: theme.colors.textSubtle },
                ]}
              >
                {tag}
              </Text>
            </View>
          ))}
          {tags.length > 3 && (
            <Text
              style={[
                styles.moreTags,
                { color: theme.colors.textSubtle },
              ]}
            >
              +{tags.length - 3}
            </Text>
          )}
        </View>
      )}

      {/* 底部信息区域 */}
      <View style={styles.footer}>
        <Text
          style={[
            styles.time,
            { color: theme.colors.textSubtle },
          ]}
        >
          {timeText}
        </Text>
        <Text
          style={[
            styles.source,
            { color: theme.colors.textSubtle },
          ]}
        >
          {getSourceLabel(fragment.source)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * 解析标签字符串
 * 支持 JSON 数组字符串 '["标签1","标签2"]' 或逗号分隔字符串 '标签1,标签2'
 */
function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  const trimmed = tagsStr.trim();
  if (!trimmed) return [];
  // 尝试解析为 JSON 数组
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      // JSON 解析失败，回退到逗号分隔
    }
  }
  // 逗号分隔格式
  return trimmed.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * 获取来源标签显示文本
 */
function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音',
    manual: '手动',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 12,
    marginLeft: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    fontSize: 12,
  },
  source: {
    fontSize: 12,
  },
});
