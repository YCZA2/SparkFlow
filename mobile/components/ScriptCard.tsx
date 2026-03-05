/**
 * 口播稿卡片组件
 * 用于口播稿列表页展示
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, useColorScheme, View, Text } from 'react-native';
import type { Script, ScriptMode, ScriptStatus } from '@/types/script';
import { formatDate } from '@/utils/date';

/**
 * 获取模式标签
 */
function getModeLabel(mode: ScriptMode): string {
  return mode === 'mode_a' ? '导师爆款' : '专属二脑';
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: ScriptStatus): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'ready':
      return '待拍摄';
    case 'filmed':
      return '已拍摄';
    default:
      return '草稿';
  }
}

/**
 * 获取状态颜色
 */
function getStatusColor(status: ScriptStatus): string {
  switch (status) {
    case 'draft':
      return '#8E8E93'; // 灰色
    case 'ready':
      return '#FF9500'; // 橙色
    case 'filmed':
      return '#34C759'; // 绿色
    default:
      return '#8E8E93';
  }
}

/**
 * 获取模式颜色
 */
function getModeColor(mode: ScriptMode): string {
  return mode === 'mode_a' ? '#FF3B30' : '#5856D6';
}

interface ScriptCardProps {
  script: Script;
  onPress: (script: Script) => void;
}

export function ScriptCard({ script, onPress }: ScriptCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // 显示标题或内容前50字
  const displayTitle = script.title || script.content?.slice(0, 50) || '无标题口播稿';
  const modeLabel = getModeLabel(script.mode);
  const statusLabel = getStatusLabel(script.status);
  const statusColor = getStatusColor(script.status);
  const modeColor = getModeColor(script.mode);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
      ]}
      onPress={() => onPress(script)}
      activeOpacity={0.7}
    >
      {/* 标题 */}
      <Text
        style={[styles.title, { color: isDark ? '#FFFFFF' : '#000000' }]}
        numberOfLines={2}
      >
        {displayTitle}
      </Text>

      {/* 标签行 */}
      <View style={styles.tagsRow}>
        {/* 模式标签 */}
        <View style={[styles.tag, { backgroundColor: modeColor + '20' }]}>
          <Text style={[styles.tagText, { color: modeColor }]}>{modeLabel}</Text>
        </View>

        {/* 状态标签 */}
        <View style={[styles.tag, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.tagText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {/* 每日推盘标记 */}
        {script.is_daily_push && (
          <View style={[styles.tag, { backgroundColor: '#FF9500' + '20' }]}>
            <Text style={[styles.tagText, { color: '#FF9500' }]}>每日推盘</Text>
          </View>
        )}
      </View>

      {/* 时间 */}
      {script.created_at && (
        <Text style={[styles.time, { color: isDark ? '#8E8E93' : '#666666' }]}>
          {formatDate(script.created_at)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
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