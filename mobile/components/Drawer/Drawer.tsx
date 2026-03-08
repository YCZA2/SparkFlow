/**
 * Drawer - 抽屉菜单主容器
 * 从左侧滑入的抽屉菜单
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* 关闭按钮 */}
      <View style={styles.header}>
        <Pressable
          onPress={close}
          hitSlop={12}
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
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

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    zIndex: 1001,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});