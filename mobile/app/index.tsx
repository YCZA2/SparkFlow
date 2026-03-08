import React, { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDrawer } from '@/providers/DrawerProvider';
import { useFolders } from '@/features/folders/hooks';
import type { FragmentFolder } from '@/types/folder';
import { InputDialog } from '@/components/InputDialog';

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

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

// 文件夹卡片组件
function FolderCard({
  folder,
  onPress,
  icon,
}: {
  folder: FragmentFolder;
  onPress: (folder: FragmentFolder) => void;
  icon?: SymbolName;
}) {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.folderCard,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      onPress={() => onPress(folder)}
      activeOpacity={0.85}
    >
      <View style={styles.folderIconContainer}>
        <SymbolView
          name={icon || 'folder.fill'}
          size={40}
          tintColor={theme.colors.primary}
        />
      </View>
      <View style={styles.folderInfo}>
        <Text
          style={[styles.folderName, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: theme.colors.textSubtle }]}>
          {folder.fragment_count} 条碎片
        </Text>
      </View>
      <SymbolView
        name="chevron.right"
        size={20}
        tintColor={theme.colors.textSubtle}
      />
    </TouchableOpacity>
  );
}

export default function FoldersScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toggle } = useDrawer();
  const { folders, isLoading, isRefreshing, isCreating, error, total, allFragmentsCount, fetchFolders, refreshFolders, createNewFolder } =
    useFolders();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  // 构造显示用的文件夹列表，添加虚拟"全部"文件夹
  const displayFolders = React.useMemo(() => {
    const allFolder: FragmentFolder = {
      id: '__all__',
      name: '全部',
      fragment_count: allFragmentsCount,
      created_at: null,
      updated_at: null,
    };
    return [allFolder, ...folders];
  }, [folders, allFragmentsCount]);

  const quickActions: Array<{
    key: string;
    icon: SymbolName;
    active?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'knowledge',
      icon: 'plus',
      onPress: () => router.push('/knowledge'),
    },
    {
      key: 'record',
      icon: 'mic.fill',
      active: true,
      onPress: () => router.push('/record-audio'),
    },
    {
      key: 'note',
      icon: 'keyboard',
      onPress: () => router.push('/text-note'),
    },
  ];

  // 页面聚焦时刷新
  useFocusEffect(
    useCallback(() => {
      void fetchFolders();
    }, [fetchFolders])
  );

  const handleFolderPress = useCallback(
    (folder: FragmentFolder) => {
      router.push({
        pathname: '/folder/[id]',
        params: { id: folder.id, name: folder.name },
      });
    },
    [router]
  );

  if (isLoading && folders.length === 0) {
    return (
      <ScreenContainer>
        <LoadingState message="正在加载文件夹..." />
      </ScreenContainer>
    );
  }

  if (error && folders.length === 0) {
    return (
      <ScreenContainer>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={fetchFolders}
          secondaryActionLabel="网络设置"
          onSecondaryAction={() => router.push('/network-settings')}
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
              全部文件夹
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
              {total} 个文件夹
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCreateDialog(true)}
            disabled={isCreating}
            style={styles.newFolderButton}
            hitSlop={8}
          >
            <SymbolView
              name="folder.badge.plus"
              size={28}
              tintColor={isCreating ? theme.colors.textSubtle : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* 列表内容 */}
      <FlatList
        data={displayFolders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FolderCard
            folder={item}
            onPress={handleFolderPress}
            icon={item.id === '__all__' ? 'tray.full' : 'folder.fill'}
          />
        )}
        ListEmptyComponent={
          <ScreenState
            icon="📁"
            title="还没有文件夹"
            message="系统会自动创建文件夹，或从后端同步"
          />
        }
        contentContainerStyle={[
          displayFolders.length === 0 ? styles.emptyList : styles.list,
          { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFolders}
            tintColor={theme.colors.primary}
          />
        }
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
      </View>

      {/* 新建文件夹弹窗 */}
      <InputDialog
        visible={showCreateDialog}
        title="新建文件夹"
        placeholder="请输入文件夹名称"
        confirmText="创建"
        cancelText="取消"
        onConfirm={async (name) => {
          try {
            await createNewFolder(name);
            setShowCreateDialog(false);
          } catch {
            // 错误已在hook中处理，这里只需保持弹窗打开
          }
        }}
        onCancel={() => setShowCreateDialog(false)}
      />
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
  newFolderButton: {
    minWidth: 44,
    alignItems: 'flex-end',
    padding: 4,
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
    paddingHorizontal: 16,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  // 文件夹卡片样式
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  folderIconContainer: {
    marginRight: 16,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  folderCount: {
    fontSize: 14,
    fontWeight: '400',
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
  quickActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
