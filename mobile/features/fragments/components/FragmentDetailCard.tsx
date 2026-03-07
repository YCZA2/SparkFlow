import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import {
  getClusterColor,
  getPointBody,
  getPointTitle,
} from '@/features/fragments/fragmentCloud';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentVisualizationPoint } from '@/types/fragment';

interface FragmentDetailCardProps {
  point: FragmentVisualizationPoint;
  isSelected: boolean;
  onToggleSelected: () => void;
  onGenerate: () => void;
  onViewDetail: () => void;
}

export function FragmentDetailCard({
  point,
  isSelected,
  onToggleSelected,
  onGenerate,
  onViewDetail,
}: FragmentDetailCardProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.detailCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.detailHeader}>
        <View style={styles.detailTitleWrap}>
          <View
            style={[
              styles.detailSwatch,
              { backgroundColor: getClusterColor(point.cluster_id, theme.colors.textSubtle) },
            ]}
          />
          <View style={styles.detailTitleBlock}>
            <Text style={[styles.detailTitle, { color: theme.colors.text }]}>{getPointTitle(point)}</Text>
            <Text style={[styles.detailMeta, { color: theme.colors.textSubtle }]}>
              {point.created_at ? point.created_at.slice(0, 10) : '无时间'}
              {point.cluster_id ? ` · 主题 ${point.cluster_id}` : ' · 未分类'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.selectToggle,
            {
              backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceMuted,
            },
          ]}
          onPress={onToggleSelected}
          activeOpacity={0.85}
        >
          <Text style={[styles.selectToggleText, { color: isSelected ? '#FFFFFF' : theme.colors.text }]}>
            {isSelected ? '已加入待生成' : '加入待生成'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.detailBody, { color: theme.colors.textMuted }]}>{getPointBody(point)}</Text>

      {point.tags?.length ? (
        <View style={styles.tagRow}>
          {point.tags.map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.tagText, { color: theme.colors.text }]}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.detailActions}>
        <TouchableOpacity
          style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}
          onPress={onGenerate}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryActionText}>用已选碎片生成</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, { backgroundColor: theme.colors.surfaceMuted }]}
          onPress={onViewDetail}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>查看碎片详情</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailCard: {
    borderRadius: 18,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTitleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 10,
  },
  detailSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
  },
  detailTitleBlock: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  detailMeta: {
    fontSize: 12,
    marginTop: 6,
  },
  selectToggle: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  selectToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailBody: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 16,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
