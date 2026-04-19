import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter, usePathname } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useImportActionSheet } from '@/providers/ImportActionSheetProvider';
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
  /*把底部快捷入口收成备忘录式悬浮胶囊，主流程页保持轻量浮在内容之上。 */
  const theme = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { visible } = useQuickActionBar();
  const importActionSheet = useImportActionSheet();

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

  const targetFolderId = folderId && folderId !== '__all__' ? folderId : undefined;

  // 构建快捷操作配置
  const quickActions: QuickAction[] = [
    {
      key: 'import',
      icon: 'plus',
      onPress: () => importActionSheet.open(targetFolderId),
    },
    {
      key: 'record',
      icon: 'mic.fill',
      active: true,
      onPress: () => {
        // 如果在特定文件夹内，传递 folderId
        if (targetFolderId) {
          router.push({
            pathname: '/record-audio',
            params: { folderId: targetFolderId },
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
        if (targetFolderId) {
          router.push({
            pathname: '/text-note',
            params: { folderId: targetFolderId },
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
    <View className="absolute left-0 right-0 z-[100] items-center" style={{ bottom: insets.bottom + 20 }}>
      <Animated.View
        entering={FadeInDown.duration(160)}
        exiting={FadeOutDown.duration(120)}
        className="min-w-[208px] flex-row items-center justify-between gap-[14px] rounded-sf-pill border px-sf-lg py-sf-sm"
        style={[
          {
            backgroundColor: theme.name === 'dark' ? '#1C1C1E' : '#FFFFFF',
            borderColor: theme.colors.border,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: theme.name === 'dark' ? 0.3 : 0.12,
            shadowRadius: 24,
            elevation: 8,
          },
        ]}
      >
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.key}
            className="h-[52px] w-[52px] items-center justify-center rounded-full"
            onPress={action.onPress}
            activeOpacity={0.78}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={[
                action.active
                  ? {
                      backgroundColor: '#FFF4CC',
                    }
                  : null,
              ]}
            >
              <SymbolView
                name={action.icon}
                size={22}
                tintColor={action.active ? '#D49A00' : theme.colors.text}
              />
            </View>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}
