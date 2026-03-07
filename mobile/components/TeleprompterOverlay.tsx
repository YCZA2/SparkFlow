import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTeleprompterController } from '@/features/recording/useTeleprompterController';

interface TeleprompterOverlayProps {
  text: string;
  scrollSpeed?: number;
  fontSize?: number;
  onPause?: () => void;
  onResume?: () => void;
}

export function TeleprompterOverlay({
  text,
  scrollSpeed = 1,
  fontSize = 24,
  onPause,
  onResume,
}: TeleprompterOverlayProps) {
  const controller = useTeleprompterController({
    text,
    scrollSpeed,
    fontSize,
    onPause,
    onResume,
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.controlsContainer}>
        <View style={styles.controlGroup}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => controller.adjustFontSize(-2)}
            activeOpacity={0.8}
          >
            <Text style={styles.controlText}>A-</Text>
          </TouchableOpacity>
          <Text style={styles.valueLabel}>{controller.currentFontSize}</Text>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => controller.adjustFontSize(2)}
            activeOpacity={0.8}
          >
            <Text style={styles.controlText}>A+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlGroup}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => controller.adjustSpeed(-controller.speedStep)}
            activeOpacity={0.8}
          >
            <Text style={styles.controlText}>S-</Text>
          </TouchableOpacity>
          <Text style={styles.valueLabel}>{controller.currentSpeed.toFixed(1)}x</Text>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => controller.adjustSpeed(controller.speedStep)}
            activeOpacity={0.8}
          >
            <Text style={styles.controlText}>S+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!controller.isPaused && (
        <TouchableOpacity style={styles.viewport} activeOpacity={1} onPress={controller.handleTap}>
          <View
            style={styles.viewportInner}
            onLayout={(e) => controller.setContainerHeight(e.nativeEvent.layout.height)}
          >
            <Animated.View style={[styles.animatedContent, { transform: [{ translateY: controller.translateY }] }]}>
              <View onLayout={(e) => controller.setContentHeight(e.nativeEvent.layout.height)}>
                <Text
                  style={[
                    styles.teleprompterText,
                    {
                      fontSize: controller.currentFontSize,
                      lineHeight: Math.round(controller.currentFontSize * 1.6),
                    },
                  ]}
                >
                  {text}
                </Text>
              </View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {controller.isPaused && (
        <View
          style={styles.viewport}
          onLayout={(e) => controller.setContainerHeight(e.nativeEvent.layout.height)}
          {...controller.panResponder.panHandlers}
        >
          <View style={styles.viewportInner}>
            <Animated.View style={[styles.animatedContent, { transform: [{ translateY: controller.translateY }] }]}>
              <View onLayout={(e) => controller.setContentHeight(e.nativeEvent.layout.height)}>
                <Text
                  style={[
                    styles.teleprompterText,
                    {
                      fontSize: controller.currentFontSize,
                      lineHeight: Math.round(controller.currentFontSize * 1.6),
                    },
                  ]}
                >
                  {text}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      )}

      {controller.isPaused && (
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
  controlsContainer: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    gap: 8,
  },
  controlGroup: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
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
  valueLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'center',
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
