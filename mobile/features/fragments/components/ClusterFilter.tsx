import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { Text } from '@/components/Themed';
import { getClusterColor } from '@/features/fragments/fragmentCloud';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentVisualizationCluster } from '@/types/fragment';

interface ClusterFilterProps {
  clusters: FragmentVisualizationCluster[];
  activeClusterId: number | 'all';
  onSelect: (clusterId: number | 'all') => void;
}

export function ClusterFilter({ clusters, activeClusterId, onSelect }: ClusterFilterProps) {
  const theme = useAppTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      <TouchableOpacity
        style={[
          styles.filterChip,
          {
            backgroundColor: activeClusterId === 'all' ? theme.colors.primary : theme.colors.surface,
            borderColor: activeClusterId === 'all' ? theme.colors.primary : theme.colors.border,
          },
        ]}
        onPress={() => onSelect('all')}
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
                activeClusterId === cluster.id
                  ? getClusterColor(cluster.id, theme.colors.primary)
                  : theme.colors.surface,
              borderColor:
                activeClusterId === cluster.id
                  ? getClusterColor(cluster.id, theme.colors.primary)
                  : theme.colors.border,
            },
          ]}
          onPress={() => onSelect(cluster.id)}
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
  );
}

const styles = StyleSheet.create({
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
});
