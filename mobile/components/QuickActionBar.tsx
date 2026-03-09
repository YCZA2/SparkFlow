import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter, usePathname } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuickActionBar } from '@/providers/QuickActionBarProvider';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

interface QuickAction {
  key: string;
  icon: SymbolName;
  active?: boolean;
  onPress: () => void;
}

/**
 * 底部快捷操作栏组件
 * 悬浮在页面之上，在主页和碎片列表页面自动显示
 * 根据当前路由自动判断可见性和 folderId
 */
export function QuickActionBar() {
  const theme = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { visible } = useQuickActionBar();

  // 根据当前路由判断是否在主流程页面（主页或碎片列表）
  const isVisible = React.useMemo(() => {
    // 如果 Provider 设置为不可见，则隐藏
    if (!visible) return false;
    // 主页
    if (pathname === '/') return true;
    // 碎片列表页面 /folder/[id]
    if (pathname.startsWith('/folder/')) return true;
    return false;
  }, [pathname, visible]);

  // 根据路由提取 folderId
  const folderId = React.useMemo(() => {
    if (pathname.startsWith('/folder/')) {
      // 从 /folder/xxx 提取 xxx
      const id = pathname.replace('/folder/', '');
      return id || undefined;
    }
    return undefined;
  }, [pathname]);

  // 构建快捷操作配置
  const quickActions: QuickAction[] = [
    {
      key: 'knowledge',
      icon: 'plus',
      onPress: () => router.push('/knowledge'),
    },
    {
      key: 'record',
      icon: 'mic.fill',
      active: true,
      onPress: () => {
        // 如果在特定文件夹内，传递 folderId
        if (folderId && folderId !== '__all__') {
          router.push({
            pathname: '/record-audio',
            params: { folderId },
          });
        } else {
          router.push('/record-audio');
        }
      },
    },
    {
      key: 'note',
      icon: 'keyboard',
      onPress: () => {
        // 如果在特定文件夹内，传递 folderId
        if (folderId && folderId !== '__all__') {
          router.push({
            pathname: '/text-note',
            params: { folderId },
          });
        } else {
          router.push('/text-note');
        }
      },
    },
  ];

  // 根据当前路由控制显示/隐藏
  if (!isVisible) {
    return null;
  }

  return (
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
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: 10,
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
