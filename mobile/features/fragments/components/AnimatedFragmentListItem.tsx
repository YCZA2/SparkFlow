import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const REMOVAL_DURATION_MS = 180;

/*统一暴露列表项退场时长，确保消费逻辑和动画视觉保持同一节奏。 */
export function getFragmentRemovalAnimationDuration(): number {
  return REMOVAL_DURATION_MS;
}

export function AnimatedFragmentListItem({
  isRemoving,
  children,
}: {
  isRemoving: boolean;
  children: React.ReactNode;
}) {
  /*列表项退场时统一做淡出+轻量收起，避免删除瞬间跳变。 */
  const progress = useSharedValue(0);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    progress.value = withTiming(isRemoving ? 1 : 0, { duration: REMOVAL_DURATION_MS });
  }, [isRemoving, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [1, 0]);
    const scale = interpolate(progress.value, [0, 1], [1, 0.96]);
    const translateY = interpolate(progress.value, [0, 1], [0, -10]);
    const height =
      measuredHeight === null
        ? undefined
        : interpolate(progress.value, [0, 1], [measuredHeight, 0]);

    return {
      opacity,
      height,
      overflow: 'hidden',
      transform: [{ scaleY: scale }, { translateY }],
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
