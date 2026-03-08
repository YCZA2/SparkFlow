import React from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { FragmentCard } from '@/components/FragmentCard';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useFragmentsScreen } from '@/features/fragments/useFragmentsScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDrawer } from '@/providers/DrawerProvider';

// 汉堡菜单图标组件
function HamburgerMenu({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.menuButton}>
      <View style={styles.hamburger}>
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
      </View>
    </TouchableOpacity>
  );
}

export default function FragmentsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const screen = useFragmentsScreen();
  const insets = useSafeAreaInsets();
  const { toggle } = useDrawer();
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* 顶部渐隐遮罩 */}
      <LinearGradient
        colors={[theme.colors.background, `${theme.colors.background}00`]}
        locations={[0.3, 1]}
        style={[styles.topFade, { height: insets.top + 80 }]}
        pointerEvents="none"
      />

      {/* 悬浮顶部导航栏 */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerContent}>
          <HamburgerMenu onPress={toggle} color={theme.colors.text} />
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              全部碎片
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
              {screen.totalLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={screen.selection.toggleSelectionMode}
            hitSlop={8}
            style={styles.selectButton}
          >
            <Text style={[styles.selectAction, { color: theme.colors.primary }]}>
              {screen.selection.isSelectionMode ? '取消' : '选择'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 列表内容 */}
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
          <View style={styles.listHeader}>
            <TouchableOpacity
              style={[
                styles.cloudButton,
                theme.shadow.card,
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
        contentContainerStyle={[
          screen.fragments.length === 0 ? styles.emptyList : styles.list,
          { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100 }
        ]}
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

      {/* 底部渐隐遮罩 */}
      <LinearGradient
        colors={[`${theme.colors.background}00`, theme.colors.background]}
        locations={[0, 0.7]}
        style={[styles.bottomFade, { height: insets.bottom + 100 }]}
        pointerEvents="none"
      />

      {/* 悬浮底部操作栏 */}
      <View style={[styles.floatingFooter, { bottom: insets.bottom + 20 }]}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // 悬浮顶部导航栏
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  selectButton: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  // 汉堡菜单样式
  menuButton: {
    padding: 4,
    minWidth: 44,
  },
  hamburger: {
    width: 24,
    height: 20,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 24,
    height: 2.5,
    borderRadius: 1.25,
  },
  // 列表样式
  list: {
    paddingHorizontal: 0,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    marginBottom: 8,
    marginHorizontal: 16,
  },
  cloudButton: {
    alignSelf: 'flex-start',
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
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
    marginLeft: 16,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectAction: {
    fontSize: 16,
    fontWeight: '600',
  },
  // 渐隐遮罩
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  // 悬浮底部操作栏
  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 22,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minWidth: 248,
  },
  selectionBar: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
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
  quickActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
