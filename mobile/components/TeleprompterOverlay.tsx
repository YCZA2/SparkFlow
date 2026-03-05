import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
  const panStartYRef = useRef(0);
  const movedRef = useRef(false);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const maxY = containerHeight;
  const minY = -contentHeight;

  const hasValidLayout = useMemo(
    () => containerHeight > 0 && contentHeight > 0,
    [containerHeight, contentHeight]
  );

  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));

  const stopRunningAnimation = () => {
    animationRef.current?.stop();
    animationRef.current = null;
  };

  const moveTo = (y: number) => {
    const nextY = clampY(y);
    currentYRef.current = nextY;
    translateY.setValue(nextY);
  };

  const startScrollFromCurrent = () => {
    if (!hasValidLayout) return;

    stopRunningAnimation();

    const startY = clampY(currentYRef.current);
    const totalDistance = Math.abs(startY - minY);
    const speed = Math.max(0.2, scrollSpeed) * BASE_SPEED_PX_PER_SEC;
    const duration = Math.max(300, Math.floor((totalDistance / speed) * 1000));

    animationRef.current = Animated.timing(translateY, {
      toValue: minY,
      duration,
      useNativeDriver: true,
    });

    animationRef.current.start(({ finished }) => {
      animationRef.current = null;
      if (finished) {
        currentYRef.current = minY;
        setIsPaused(true);
      }
    });
  };

  const resetAndStart = () => {
    if (!hasValidLayout) return;
    moveTo(maxY);
    setIsPaused(false);
    startScrollFromCurrent();
  };

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentYRef.current = value;
    });
    return () => {
      translateY.removeListener(id);
      stopRunningAnimation();
    };
  }, [translateY]);

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

  const togglePause = () => {
    if (!hasValidLayout) return;

    if (isPaused) {
      setIsPaused(false);
      onResume?.();
      startScrollFromCurrent();
    } else {
      stopRunningAnimation();
      setIsPaused(true);
      onPause?.();
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          isPaused && Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          panStartYRef.current = currentYRef.current;
          movedRef.current = false;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isPaused) return;
          movedRef.current = true;
          moveTo(panStartYRef.current + gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          const isTap = !movedRef.current || Math.abs(gestureState.dy) < 2;
          if (isTap) {
            togglePause();
          }
        },
      }),
    [isPaused]
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

      <View
        style={styles.viewport}
        onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        {...panResponder.panHandlers}
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
});
