import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { ScriptCard } from '@/components/ScriptCard';
import { useScripts } from '@/hooks/useScripts';
import { useAppTheme } from '@/theme/useAppTheme';

export default function ScriptsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { items, isLoading, isRefreshing, error, reload, refresh } = useScripts();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '我的口播稿' }} />
        <LoadingState message="正在加载口播稿..." />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '我的口播稿' }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={reload}
          secondaryActionLabel="网络设置"
          onSecondaryAction={() => router.push('/network-settings')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: '我的口播稿' }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ScriptCard script={item} onPress={(script) => router.push(`/script/${script.id}`)} />}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.header}>
              <Text style={[styles.headerText, { color: theme.colors.textSubtle }]}>
                共 {items.length} 篇口播稿
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <ScreenState
            icon="📄"
            title="还没有口播稿"
            message="去碎片库选择灵感，生成你的第一篇口播稿"
          />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: {
    fontSize: 13,
  },
});
