import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter, usePathname } from 'expo-router';
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
    <View style={[styles.floatingFooter, { bottom: insets.bottom + 20 }]}>
      <View
        style={[
          styles.quickActionPill,
          {
            backgroundColor: theme.name === 'dark' ? '#1C1C1E' : '#FFFFFF',
            borderColor: theme.colors.border,
            shadowOpacity: theme.name === 'dark' ? 0.3 : 0.12,
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
            <View
              style={[
                styles.quickActionIconShell,
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
      </View>
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
    gap: 14,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 208,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
  quickActionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
