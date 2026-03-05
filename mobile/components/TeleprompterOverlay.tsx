import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface TeleprompterOverlayProps {
  text: string;
  scrollSpeed?: number;
  fontSize?: number;
  onPause?: () => void;
  onResume?: () => void;
}

const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 40;
const BASE_SPEED_PX_PER_SEC = 35;

export function TeleprompterOverlay({
  text,
  scrollSpeed = 1,
  fontSize = 24,
  onPause,
  onResume,
}: TeleprompterOverlayProps) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(
    Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize))
  );

  const translateY = useRef(new Animated.Value(0)).current;
  const currentYRef = useRef(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isPausedRef = useRef(false);
  const panStartYRef = useRef(0);
  const hasMovedRef = useRef(false);

  // 同步 isPaused 状态到 ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const maxY = containerHeight;
  const minY = -contentHeight;

  const hasValidLayout = useMemo(
    () => containerHeight > 0 && contentHeight > 0,
    [containerHeight, contentHeight]
  );

  const clampY = useCallback(
    (value: number) => Math.max(minY, Math.min(maxY, value)),
    [minY, maxY]
  );

  const stopRunningAnimation = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
  }, []);

  const moveTo = useCallback(
    (y: number) => {
      const nextY = clampY(y);
      currentYRef.current = nextY;
      translateY.setValue(nextY);
    },
    [clampY, translateY]
  );

  const startScrollFromCurrent = useCallback(() => {
    if (!hasValidLayout) return;

    stopRunningAnimation();

    const startY = clampY(currentYRef.current);
    const totalDistance = Math.abs(startY - minY);
    const speed = Math.max(0.2, scrollSpeed) * BASE_SPEED_PX_PER_SEC;
    const duration = Math.max(300, Math.floor((totalDistance / speed) * 1000));

    animationRef.current = Animated.timing(translateY, {
      toValue: minY,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    animationRef.current.start(({ finished }) => {
      animationRef.current = null;
      if (finished) {
        currentYRef.current = minY;
        setIsPaused(true);
      }
    });
  }, [hasValidLayout, stopRunningAnimation, clampY, minY, scrollSpeed, translateY]);

  const resetAndStart = useCallback(() => {
    if (!hasValidLayout) return;
    moveTo(maxY);
    setIsPaused(false);
    startScrollFromCurrent();
  }, [hasValidLayout, moveTo, maxY, startScrollFromCurrent]);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentYRef.current = value;
    });
    return () => {
      translateY.removeListener(id);
      stopRunningAnimation();
    };
  }, [translateY, stopRunningAnimation]);

  useEffect(() => {
    if (!hasValidLayout) return;
    resetAndStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidLayout, text]);

  useEffect(() => {
    if (!hasValidLayout) return;
    moveTo(currentYRef.current);
    if (!isPaused) {
      startScrollFromCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentHeight, containerHeight]);

  // 点击切换暂停/继续
  const handleTap = useCallback(() => {
    if (!hasValidLayout) return;

    if (isPausedRef.current) {
      // 从暂停恢复
      setIsPaused(false);
      onResume?.();
      setTimeout(() => {
        startScrollFromCurrent();
      }, 50);
    } else {
      // 暂停
      stopRunningAnimation();
      setIsPaused(true);
      onPause?.();
    }
  }, [hasValidLayout, stopRunningAnimation, onPause, onResume, startScrollFromCurrent]);

  // 拖动手势 - 只在暂停状态下启用
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 只在暂停状态下响应手势
        onStartShouldSetPanResponder: () => isPausedRef.current,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          isPausedRef.current && Math.abs(gestureState.dy) > 5,

        onPanResponderGrant: () => {
          panStartYRef.current = currentYRef.current;
          hasMovedRef.current = false;
        },

        onPanResponderMove: (_, gestureState) => {
          if (Math.abs(gestureState.dy) > 5) {
            hasMovedRef.current = true;
            moveTo(panStartYRef.current + gestureState.dy);
          }
        },

        onPanResponderRelease: (_, gestureState) => {
          // 如果没有移动，则视为点击，切换暂停状态
          if (!hasMovedRef.current && Math.abs(gestureState.dy) < 5) {
            handleTap();
          }
        },

        onPanResponderTerminate: () => {
          // 手势被终止
        },
      }),
    [moveTo, handleTap]
  );

  const adjustFontSize = (delta: number) => {
    setCurrentFontSize((prev) => Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, prev + delta)));
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.fontControls}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => adjustFontSize(-2)} activeOpacity={0.8}>
          <Text style={styles.controlText}>A-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={() => adjustFontSize(2)} activeOpacity={0.8}>
          <Text style={styles.controlText}>A+</Text>
        </TouchableOpacity>
      </View>

      {/* 滚动状态下用 TouchableOpacity 处理点击暂停 */}
      {!isPaused && (
        <TouchableOpacity
          style={styles.viewport}
          activeOpacity={1}
          onPress={handleTap}
        >
          <View
            style={styles.viewportInner}
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
          >
            <Animated.View style={[styles.animatedContent, { transform: [{ translateY }] }]}>
              <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>
                <Text
                  style={[
                    styles.teleprompterText,
                    { fontSize: currentFontSize, lineHeight: Math.round(currentFontSize * 1.6) },
                  ]}
                >
                  {text}
                </Text>
              </View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {/* 暂停状态下用 PanResponder 处理拖动和点击 */}
      {isPaused && (
        <View
          style={styles.viewport}
          onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
          {...panResponder.panHandlers}
        >
          <View style={styles.viewportInner}>
            <Animated.View style={[styles.animatedContent, { transform: [{ translateY }] }]}>
              <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>
                <Text
                  style={[
                    styles.teleprompterText,
                    { fontSize: currentFontSize, lineHeight: Math.round(currentFontSize * 1.6) },
                  ]}
                >
                  {text}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      )}

      {/* 暂停状态指示器 */}
      {isPaused && (
        <View style={styles.pauseIndicator}>
          <Text style={styles.pauseText}>已暂停 · 拖动调整进度 · 点击继续</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  fontControls: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  controlText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewport: {
    flex: 1,
  },
  viewportInner: {
    flex: 1,
    paddingHorizontal: 12,
  },
  animatedContent: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  teleprompterText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pauseIndicator: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pauseText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});