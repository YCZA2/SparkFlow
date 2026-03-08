import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

interface QuickAction {
  key: string;
  icon: SymbolName;
  active?: boolean;
  onPress: () => void;
}

interface QuickActionBarProps {
  /** 当前文件夹ID，不传表示在"全部"文件夹 */
  folderId?: string;
  /** 是否显示，默认为 true */
  visible?: boolean;
}

/**
 * 底部快捷操作栏组件
 * 在文件夹列表和碎片列表页面共用
 * 根据当前所在文件夹决定新建碎片的归属
 */
export function QuickActionBar({ folderId, visible = true }: QuickActionBarProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  if (!visible) {
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
