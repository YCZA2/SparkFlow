import React, { useEffect, useLayoutEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const ANIMATION_DELAY_MS = 100;
const REMOVAL_DURATION_MS = 180;
const ADDITION_DURATION_MS = 220;

/*统一暴露列表项退场时长，确保消费逻辑和动画视觉保持同一节奏。 */
export function getFragmentRemovalAnimationDuration(): number {
  return ANIMATION_DELAY_MS + REMOVAL_DURATION_MS;
}

/*统一暴露新增入场时长，便于列表状态在动画结束后清理临时标记。 */
export function getFragmentAdditionAnimationDuration(): number {
  return ANIMATION_DELAY_MS + ADDITION_DURATION_MS;
}

export function AnimatedFragmentListItem({
  isAppearing = false,
  isRemoving,
  children,
}: {
  isAppearing?: boolean;
  isRemoving: boolean;
  children: React.ReactNode;
}) {
  /*列表项新增和退场都在卡片自身完成，避免刷新控件承担数据变化反馈。 */
  const enterProgress = useSharedValue(isAppearing ? 0 : 1);
  const removeProgress = useSharedValue(0);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isAppearing) {
      enterProgress.value = 1;
      return;
    }
    enterProgress.value = 0;
    enterProgress.value = withDelay(
      ANIMATION_DELAY_MS,
      withTiming(1, { duration: ADDITION_DURATION_MS })
    );
  }, [enterProgress, isAppearing]);

  useEffect(() => {
    removeProgress.value = isRemoving
      ? withDelay(ANIMATION_DELAY_MS, withTiming(1, { duration: REMOVAL_DURATION_MS }))
      : withTiming(0, { duration: REMOVAL_DURATION_MS });
  }, [isRemoving, removeProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = enterProgress.value * interpolate(removeProgress.value, [0, 1], [1, 0]);
    const enterScale = interpolate(enterProgress.value, [0, 1], [0.98, 1]);
    const removeScale = interpolate(removeProgress.value, [0, 1], [1, 0.96]);
    const enterTranslateY = interpolate(enterProgress.value, [0, 1], [12, 0]);
    const removeTranslateY = interpolate(removeProgress.value, [0, 1], [0, -10]);
    const height =
      measuredHeight === null
        ? undefined
        : measuredHeight *
          enterProgress.value *
          interpolate(removeProgress.value, [0, 1], [1, 0]);

    return {
      opacity,
      height,
      overflow: 'hidden',
      transform: [
        { scaleY: enterScale * removeScale },
        { translateY: enterTranslateY + removeTranslateY },
      ],
    };
  }, [measuredHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    /*只记录首个稳定高度，避免动画过程中反复覆盖收起基线。 */
    if (measuredHeight !== null) {
      return;
    }
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight > 0) {
      setMeasuredHeight(nextHeight);
    }
  };

  return (
    <Animated.View style={animatedStyle}>
      <View
        onLayout={handleLayout}
        style={[styles.content, measuredHeight === null ? null : styles.absoluteFill]}
      >
        {children}
      </View>
      {measuredHeight !== null ? <View style={{ height: measuredHeight, opacity: 0 }} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
  },
  absoluteFill: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
