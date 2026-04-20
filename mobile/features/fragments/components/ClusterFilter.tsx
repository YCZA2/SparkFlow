import React from 'react';
import { ScrollView, TouchableOpacity, Text } from 'react-native';

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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-[10px] pr-sf-md">
      <TouchableOpacity
        className="rounded-sf-pill border px-[14px] py-[10px]"
        style={[
          {
            backgroundColor: activeClusterId === 'all' ? theme.colors.primary : theme.colors.surface,
            borderColor: activeClusterId === 'all' ? theme.colors.primary : theme.colors.border,
          },
        ]}
        onPress={() => onSelect('all')}
        activeOpacity={0.85}
      >
        <Text
          className="text-sm font-semibold"
          style={{ color: activeClusterId === 'all' ? '#FFFFFF' : theme.colors.text }}
        >
          全部
        </Text>
      </TouchableOpacity>

      {clusters.map((cluster) => (
        <TouchableOpacity
          key={cluster.id}
          className="rounded-sf-pill border px-[14px] py-[10px]"
          style={[
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
            className="text-sm font-semibold"
            style={{ color: activeClusterId === cluster.id ? '#FFFFFF' : theme.colors.text }}
          >
            {cluster.label} · {cluster.fragment_count}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
