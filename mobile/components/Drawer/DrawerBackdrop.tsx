/**
 * DrawerBackdrop - 抽屉背景遮罩
 * 半透明背景，点击关闭抽屉
 */
import React from 'react';
import { Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface DrawerBackdropProps {
  onPress: () => void;
}

export function DrawerBackdrop({ onPress }: DrawerBackdropProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="absolute inset-0 z-[1000] bg-black/40"
    >
      <Pressable className="flex-1" onPress={onPress} />
    </Animated.View>
  );
}
