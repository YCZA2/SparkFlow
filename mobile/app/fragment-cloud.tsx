import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useFragmentVisualization } from '@/features/fragments/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentVisualizationPoint } from '@/types/fragment';

const CLOUD_COLORS = ['#2A9D8F', '#E76F51', '#F4A261', '#3A86FF', '#E63946', '#6A4C93'];
const CLOUD_HEIGHT = 360;
const CLOUD_PADDING = 20;

function getClusterColor(clusterId: number | null | undefined, fallback: string) {
  if (!clusterId) {
    return fallback;
  }
  return CLOUD_COLORS[(clusterId - 1) % CLOUD_COLORS.length];
}

function getPointTitle(point: FragmentVisualizationPoint) {
  if (point.summary) return point.summary;
  if (point.transcript) return point.transcript.slice(0, 56);
  return '未命名灵感';
}

function getPointBody(point: FragmentVisualizationPoint) {
  if (point.transcript) return point.transcript;
  if (point.summary) return point.summary;
  return '这条碎片暂无可展示内容。';
}

function pointSize(point: FragmentVisualizationPoint, active: boolean, selected: boolean) {
  const zRatio = (point.z + 1) / 2;
  const base = 16 + zRatio * 16;
  if (active) return base + 6;
  if (selected) return base + 3;
  return base;
}

function projectPoint(
  point: FragmentVisualizationPoint,
  width: number,
  height: number,
  size: number
) {
  const safeWidth = Math.max(width - CLOUD_PADDING * 2, 40);
  const safeHeight = Math.max(height - CLOUD_PADDING * 2, 40);
  const x = ((point.x + 1) / 2) * safeWidth + CLOUD_PADDING;
  const y = ((point.y + 1) / 2) * safeHeight + CLOUD_PADDING;

  return {
    left: Math.max(0, Math.min(width - size, x - size / 2)),
    top: Math.max(0, Math.min(height - size, y - size / 2)),
  };
}

export default function FragmentCloudScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { visualization, isLoading, error, reloadVisualization } = useFragmentVisualization();
  const [activeClusterId, setActiveClusterId] = useState<number | 'all'>('all');
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cloudSize, setCloudSize] = useState({ width: 0, height: CLOUD_HEIGHT });

  const points = visualization?.points ?? [];
  const clusters = visualization?.clusters ?? [];

  const filteredPoints = useMemo(() => {
    if (activeClusterId === 'all') {
      return points;
    }
    return points.filter((point) => point.cluster_id === activeClusterId);
  }, [activeClusterId, points]);

  const focusedPoint = useMemo(
    () => filteredPoints.find((point) => point.id === focusedPointId) ?? filteredPoints[0] ?? null,
    [filteredPoints, focusedPointId]
  );

  useEffect(() => {
    if (activeClusterId !== 'all' && !clusters.some((cluster) => cluster.id === activeClusterId)) {
      setActiveClusterId('all');
    }
  }, [activeClusterId, clusters]);

  useEffect(() => {
    if (!focusedPoint) {
      setFocusedPointId(null);
      return;
    }
    if (focusedPoint.id !== focusedPointId) {
      setFocusedPointId(focusedPoint.id);
    }
  }, [focusedPoint, focusedPointId]);

  const stats = visualization?.stats;
  const selectedCount = selectedIds.length;
  const visibleSelectedCount = filteredPoints.filter((point) => selectedIds.includes(point.id)).length;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCloudSize({
      width,
      height: height || CLOUD_HEIGHT,
    });
  };

  const toggleSelected = (fragmentId: string) => {
    setSelectedIds((current) =>
      current.includes(fragmentId)
        ? current.filter((id) => id !== fragmentId)
        : [...current, fragmentId]
    );
  };

  const selectVisiblePoints = () => {
    setSelectedIds((current) => {
      const merged = new Set(current);
      filteredPoints.forEach((point) => merged.add(point.id));
      return Array.from(merged);
    });
  };

  const clearVisibleSelection = () => {
    const visibleIds = new Set(filteredPoints.map((point) => point.id));
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  };

  const handleGenerate = () => {
    if (selectedIds.length === 0) {
      Alert.alert('还没选碎片', '先点几个点位加入待生成列表。');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: selectedIds.join(',') },
    });
  };

  if (isLoading && !visualization) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '灵感云图' }} />
        <LoadingState message="正在整理你的灵感向量..." />
      </View>
    );
  }

  if (error && !visualization) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '灵感云图' }} />
        <ScreenState
          icon="⚠️"
          title="云图加载失败"
          message={error}
          actionLabel="重新加载"
          onAction={reloadVisualization}
          secondaryActionLabel="返回碎片库"
          onSecondaryAction={() => router.back()}
        />
      </View>
    );
  }

  if (points.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '灵感云图' }} />
        <ScreenState
          icon="☁️"
          title="还没有可视化数据"
          message="先录入并完成几条碎片转写，系统会自动把已有向量排成云图。"
          actionLabel="返回碎片库"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: '灵感云图' }} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.kicker, { color: theme.colors.textSubtle }]}>SparkFlow Visualization</Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>把零散灵感看成一片主题云</Text>
          <Text style={[styles.heroDesc, { color: theme.colors.textMuted }]}>
            点击点位看详情，按主题筛选，再带着选中的碎片继续生成口播稿。
          </Text>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {stats?.total_fragments ?? points.length}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>已上图碎片</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {stats?.clustered_fragments ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>已成主题</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {stats?.uncategorized_fragments ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>待积累</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  activeClusterId === 'all' ? theme.colors.primary : theme.colors.surface,
                borderColor:
                  activeClusterId === 'all' ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => setActiveClusterId('all')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: activeClusterId === 'all' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              全部
            </Text>
          </TouchableOpacity>

          {clusters.map((cluster) => (
            <TouchableOpacity
              key={cluster.id}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    activeClusterId === cluster.id ? getClusterColor(cluster.id, theme.colors.primary) : theme.colors.surface,
                  borderColor:
                    activeClusterId === cluster.id ? getClusterColor(cluster.id, theme.colors.primary) : theme.colors.border,
                },
              ]}
              onPress={() => setActiveClusterId(cluster.id)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: activeClusterId === cluster.id ? '#FFFFFF' : theme.colors.text },
                ]}
              >
                {cluster.label} · {cluster.fragment_count}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.cloudCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.cloudHeader}>
            <View>
              <Text style={[styles.cloudTitle, { color: theme.colors.text }]}>
                {activeClusterId === 'all' ? '全量灵感分布' : '当前主题视图'}
              </Text>
              <Text style={[styles.cloudSubtitle, { color: theme.colors.textSubtle }]}>
                当前显示 {filteredPoints.length} 个点位
                {clusters.length === 0 ? '，数据还不够多，暂时只展示分布。' : '，点越大代表 z 轴越靠前。'}
              </Text>
            </View>
            <View style={styles.cloudActions}>
              <TouchableOpacity
                style={[styles.smallAction, { backgroundColor: theme.colors.surfaceMuted }]}
                onPress={selectVisiblePoints}
                activeOpacity={0.85}
              >
                <Text style={[styles.smallActionText, { color: theme.colors.text }]}>全选当前</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallAction, { backgroundColor: theme.colors.surfaceMuted }]}
                onPress={clearVisibleSelection}
                activeOpacity={0.85}
              >
                <Text style={[styles.smallActionText, { color: theme.colors.text }]}>清空当前</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.cloudCanvas,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
            onLayout={handleLayout}
          >
            <View style={[styles.backgroundOrb, { backgroundColor: theme.colors.background }]} />
            <View
              style={[
                styles.backgroundOrbSecondary,
                { backgroundColor: theme.colors.surface },
              ]}
            />

            {filteredPoints.map((point) => {
              const isFocused = point.id === focusedPoint?.id;
              const isSelected = selectedIds.includes(point.id);
              const size = pointSize(point, isFocused, isSelected);
              const position = projectPoint(point, cloudSize.width || 320, cloudSize.height || CLOUD_HEIGHT, size);
              const color = getClusterColor(point.cluster_id, theme.colors.textSubtle);

              return (
                <TouchableOpacity
                  key={point.id}
                  style={[
                    styles.point,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      left: position.left,
                      top: position.top,
                      backgroundColor: color,
                      opacity: 0.62 + ((point.z + 1) / 2) * 0.28,
                      borderColor: isFocused ? '#FFFFFF' : theme.colors.background,
                      borderWidth: isFocused || isSelected ? 2 : 0,
                    },
                  ]}
                  onPress={() => setFocusedPointId(point.id)}
                  activeOpacity={0.9}
                />
              );
            })}
          </View>

          <Text style={[styles.selectionHint, { color: theme.colors.textSubtle }]}>
            已在待生成列表中选中 {selectedCount} 条，其中当前筛选下 {visibleSelectedCount} 条
          </Text>
        </View>

        {focusedPoint ? (
          <View style={[styles.detailCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleWrap}>
                <View
                  style={[
                    styles.detailSwatch,
                    { backgroundColor: getClusterColor(focusedPoint.cluster_id, theme.colors.textSubtle) },
                  ]}
                />
                <View style={styles.detailTitleBlock}>
                  <Text style={[styles.detailTitle, { color: theme.colors.text }]}>
                    {getPointTitle(focusedPoint)}
                  </Text>
                  <Text style={[styles.detailMeta, { color: theme.colors.textSubtle }]}>
                    {focusedPoint.created_at ? focusedPoint.created_at.slice(0, 10) : '无时间'}
                    {focusedPoint.cluster_id ? ` · 主题 ${focusedPoint.cluster_id}` : ' · 未分类'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.selectToggle,
                  {
                    backgroundColor: selectedIds.includes(focusedPoint.id)
                      ? theme.colors.primary
                      : theme.colors.surfaceMuted,
                  },
                ]}
                onPress={() => toggleSelected(focusedPoint.id)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.selectToggleText,
                    { color: selectedIds.includes(focusedPoint.id) ? '#FFFFFF' : theme.colors.text },
                  ]}
                >
                  {selectedIds.includes(focusedPoint.id) ? '已加入待生成' : '加入待生成'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.detailBody, { color: theme.colors.textMuted }]}>
              {getPointBody(focusedPoint)}
            </Text>

            {focusedPoint.tags?.length ? (
              <View style={styles.tagRow}>
                {focusedPoint.tags.map((tag) => (
                  <View
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: theme.colors.surfaceMuted }]}
                  >
                    <Text style={[styles.tagText, { color: theme.colors.text }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}
                onPress={handleGenerate}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionText}>用已选碎片生成</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryAction, { backgroundColor: theme.colors.surfaceMuted }]}
                onPress={() => router.push(`/fragment/${focusedPoint.id}`)}
                activeOpacity={0.85}
              >
                <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>查看碎片详情</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 18,
    padding: 18,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    marginTop: 10,
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  filterRow: {
    gap: 10,
    paddingRight: 12,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cloudCard: {
    borderRadius: 18,
    padding: 16,
  },
  cloudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cloudTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cloudSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 220,
  },
  cloudActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  smallAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cloudCanvas: {
    height: CLOUD_HEIGHT,
    borderRadius: 22,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -40,
    top: -30,
    opacity: 0.45,
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    left: -20,
    bottom: -30,
    opacity: 0.65,
  },
  point: {
    position: 'absolute',
  },
  selectionHint: {
    fontSize: 12,
    marginTop: 12,
  },
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
