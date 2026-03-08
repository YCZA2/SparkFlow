/**
 * DrawerBackdrop - 抽屉背景遮罩
 * 半透明背景，点击关闭抽屉
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface DrawerBackdropProps {
  onPress: () => void;
}

export function DrawerBackdrop({ onPress }: DrawerBackdropProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.container}
    >
      <Pressable style={styles.pressable} onPress={onPress} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    zIndex: 1000,
  },
  pressable: {
    flex: 1,
  },
});