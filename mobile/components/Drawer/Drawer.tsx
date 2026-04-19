/**
 * Drawer - 抽屉菜单主容器
 * 从左侧滑入的抽屉菜单
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerContent } from './DrawerContent';
import { useDrawer } from '@/providers/DrawerProvider';
import { useAppTheme } from '@/theme/useAppTheme';

export function Drawer() {
  const { close } = useDrawer();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={SlideInLeft.duration(250)}
      exiting={SlideOutLeft.duration(200)}
      className="absolute bottom-0 left-0 top-0 z-[1001] w-[300px] border-r border-black/10 bg-app-surface dark:bg-app-surface-dark"
      style={[
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* 关闭按钮 */}
      <View className="flex-row justify-end px-sf-lg py-sf-sm">
        <Pressable
          onPress={close}
          hitSlop={12}
          className="h-8 w-8 items-center justify-center rounded-full bg-black/5"
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <SymbolView
            name="xmark"
            size={20}
            tintColor={theme.colors.text}
          />
        </Pressable>
      </View>

      {/* 抽屉内容 */}
      <DrawerContent closeDrawer={close} />
    </Animated.View>
  );
}
