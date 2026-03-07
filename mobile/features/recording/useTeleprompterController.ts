import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder } from 'react-native';
import {
  clampFontSize,
  clampSpeed,
  isTapAfterPan,
  shouldStartPan,
} from '@/features/recording/teleprompterState';

const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 40;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3.0;
const SPEED_STEP = 0.2;
const BASE_SPEED_PX_PER_SEC = 20;

interface UseTeleprompterControllerParams {
  text: string;
  scrollSpeed: number;
  fontSize: number;
  onPause?: () => void;
  onResume?: () => void;
}

export function useTeleprompterController({
  text,
  scrollSpeed,
  fontSize,
  onPause,
  onResume,
}: UseTeleprompterControllerParams) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(
    clampFontSize(fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
  );
  const [currentSpeed, setCurrentSpeed] = useState(
    clampSpeed(scrollSpeed, MIN_SPEED, MAX_SPEED)
  );

  const translateY = useRef(new Animated.Value(0)).current;
  const currentYRef = useRef(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isPausedRef = useRef(false);
  const panStartYRef = useRef(0);
  const hasMovedRef = useRef(false);

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
    const speed = Math.max(0.2, currentSpeed) * BASE_SPEED_PX_PER_SEC;
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
  }, [hasValidLayout, stopRunningAnimation, clampY, minY, currentSpeed, translateY]);

  useEffect(() => {
    if (!hasValidLayout || isPaused) return;
    startScrollFromCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpeed]);

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

  const handleTap = useCallback(() => {
    if (!hasValidLayout) return;

    if (isPausedRef.current) {
      setIsPaused(false);
      onResume?.();
      requestAnimationFrame(() => {
        startScrollFromCurrent();
      });
    } else {
      stopRunningAnimation();
      setIsPaused(true);
      onPause?.();
    }
  }, [hasValidLayout, stopRunningAnimation, onPause, onResume, startScrollFromCurrent]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isPausedRef.current,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          shouldStartPan(isPausedRef.current, gestureState.dy, 5),

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
          if (isTapAfterPan(hasMovedRef.current, gestureState.dy, 5)) {
            handleTap();
          }
        },

        onPanResponderTerminate: () => {
          // no-op
        },
      }),
    [moveTo, handleTap]
  );

  const adjustFontSize = (delta: number) => {
    setCurrentFontSize((prev) => clampFontSize(prev + delta, MIN_FONT_SIZE, MAX_FONT_SIZE));
  };

  const adjustSpeed = (delta: number) => {
    setCurrentSpeed((prev) => clampSpeed(prev + delta, MIN_SPEED, MAX_SPEED));
  };

  return {
    isPaused,
    currentFontSize,
    currentSpeed,
    translateY,
    panResponder,
    handleTap,
    adjustFontSize,
    adjustSpeed,
    setContainerHeight,
    setContentHeight,
    speedStep: SPEED_STEP,
  };
}
