import React from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

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
  type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

  const quickActions: Array<{
    key: string;
    icon: SymbolName;
    active?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'knowledge',
      icon: 'plus',
      onPress: screen.openKnowledgePlaceholder,
    },
    {
      key: 'record',
      icon: 'mic.fill',
      active: true,
      onPress: screen.openRecorder,
    },
    {
      key: 'note',
      icon: 'keyboard',
      onPress: screen.openTextNote,
    },
  ];

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
        <BottomActionBar
          style={styles.footerShell}
          contentStyle={styles.footerContent}
        >
          <View pointerEvents="none" style={styles.footerTransition}>
            <View
              style={[
                styles.transitionLayerLarge,
                { backgroundColor: theme.colors.background, opacity: 0.72 },
              ]}
            />
            <View
              style={[
                styles.transitionLayerMedium,
                { backgroundColor: theme.colors.background, opacity: 0.5 },
              ]}
            />
            <View
              style={[
                styles.transitionLayerSmall,
                { backgroundColor: theme.colors.background, opacity: 0.28 },
              ]}
            />
          </View>
          {screen.selection.isSelectionMode ? (
            <Animated.View
              entering={FadeInDown.duration(160)}
              exiting={FadeOutDown.duration(120)}
              style={[
                styles.selectionBar,
                theme.shadow.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
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
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(160)}
              exiting={FadeOutDown.duration(120)}
              style={[
                styles.quickActionPill,
                theme.shadow.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.quickActionButton}
                  onPress={action.onPress}
                  activeOpacity={0.78}
                >
                  <SymbolView
                    name={action.icon}
                    size={30}
                    tintColor={action.active ? '#F05A28' : theme.colors.text}
                  />
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}
        </BottomActionBar>
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
          <ScreenState icon="📝" title="还没有灵感碎片" message="去录一条或记一条吧" />
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
    paddingBottom: 116,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 116,
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
  footerShell: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingHorizontal: 14,
  },
  footerContent: {
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'center',
  },
  footerTransition: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  transitionLayerLarge: {
    width: '100%',
    height: 18,
    borderRadius: 999,
  },
  transitionLayerMedium: {
    width: '94%',
    height: 14,
    borderRadius: 999,
  },
  transitionLayerSmall: {
    width: '88%',
    height: 10,
    borderRadius: 999,
  },
  quickActionPill: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 22,
    minWidth: 248,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginBottom: -10,
  },
  selectionBar: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
    marginBottom: -10,
  },
  quickActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
