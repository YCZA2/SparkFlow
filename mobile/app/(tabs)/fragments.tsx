import React from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { FragmentCard } from '@/components/FragmentCard';
import { BottomActionBar } from '@/components/layout/BottomActionBar';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useFragmentsScreen } from '@/features/fragments/useFragmentsScreen';
import { useAppTheme } from '@/theme/useAppTheme';

export default function FragmentsScreen() {
  const theme = useAppTheme();
  const screen = useFragmentsScreen();

  if (screen.isLoading && screen.fragments.length === 0) {
    return (
      <ScreenContainer>
        <LoadingState message="正在加载碎片..." />
      </ScreenContainer>
    );
  }

  if (screen.error && screen.fragments.length === 0) {
    return (
      <ScreenContainer>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={screen.error}
          actionLabel="点击重试"
          onAction={screen.reload}
          secondaryActionLabel="网络设置"
          onSecondaryAction={screen.openNetworkSettings}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      footer={
        screen.selection.isSelectionMode ? (
          <BottomActionBar>
            <TouchableOpacity
              style={[
                styles.generateButton,
                {
                  backgroundColor:
                    screen.selection.selectedCount > 0
                      ? theme.colors.primary
                      : theme.colors.textSubtle,
                },
              ]}
              onPress={screen.onGenerate}
              activeOpacity={0.85}
            >
              <Text style={styles.generateButtonText}>
                交给 AI 编导（已选 {screen.selection.selectedCount}/{screen.selection.maxSelection} 条）
              </Text>
            </TouchableOpacity>
          </BottomActionBar>
        ) : null
      }
    >
      <SectionList
        sections={screen.sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <FragmentCard
            fragment={item}
            onPress={screen.onFragmentPress}
            selectable={screen.selection.isSelectionMode}
            selected={screen.selection.selectedSet.has(item.id)}
            isFirstInSection={index === 0}
            isLastInSection={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              eyebrow="整理"
              title="全部碎片"
              subtitle="像备忘录一样翻看你的语音记录和文字记录。"
              trailing={
                <TouchableOpacity onPress={screen.selection.toggleSelectionMode} hitSlop={8}>
                  <Text style={[styles.selectAction, { color: theme.colors.primary }]}>
                    {screen.selection.isSelectionMode ? '取消' : '选择'}
                  </Text>
                </TouchableOpacity>
              }
            />
            <Text style={[styles.totalCount, { color: theme.colors.textSubtle }]}>
              {screen.totalLabel}
            </Text>
            <TouchableOpacity
              style={[
                styles.cloudButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
              onPress={screen.openCloud}
              activeOpacity={0.85}
            >
              <Text style={[styles.cloudButtonText, { color: theme.colors.primary }]}>
                打开灵感云图
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <ScreenState icon="📝" title="还没有灵感碎片" message="去捕获页记一条吧" />
        }
        contentContainerStyle={screen.fragments.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={screen.isRefreshing}
            onRefresh={screen.refresh}
            tintColor={theme.colors.primary}
          />
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  totalCount: {
    marginTop: -8,
    fontSize: 14,
    fontWeight: '500',
  },
  cloudButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  cloudButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  selectAction: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 16,
  },
  generateButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
