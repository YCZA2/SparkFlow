import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

function formatClock(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

interface FragmentAudioPlayerControlsProps {
  isReady: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  disabled?: boolean;
  compact?: boolean;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void | Promise<void>;
  onSkipForward: () => void | Promise<void>;
  onSkipBackward: () => void | Promise<void>;
  onChangeRate: () => void;
}

export function FragmentAudioPlayerControls({
  isReady,
  isPlaying,
  positionMs,
  durationMs,
  playbackRate,
  disabled = false,
  compact = false,
  onTogglePlay,
  onSeek,
  onSkipForward,
  onSkipBackward,
  onChangeRate,
}: FragmentAudioPlayerControlsProps) {
  /** 中文注释：渲染可复用的音频控制区，支持详情页抽屉和固定底栏两种容器。 */
  const theme = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const remainingMs = Math.max(0, durationMs - positionMs);
  const playLabel = useMemo(() => (isPlaying ? '暂停' : '播放'), [isPlaying]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const handleTrackPress = (locationX: number) => {
    if (!trackWidth || durationMs <= 0 || disabled) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    void onSeek(Math.round(durationMs * ratio));
  };

  return (
    <View
      style={[
        styles.card,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          paddingHorizontal: compact ? 14 : 16,
          paddingTop: compact ? 10 : 12,
          paddingBottom: compact ? 10 : 12,
          borderRadius: compact ? 16 : 18,
        },
      ]}
    >
      <Pressable
        onLayout={handleTrackLayout}
        onPress={(event) => handleTrackPress(event.nativeEvent.locationX)}
        style={styles.trackHitArea}
        disabled={disabled}
      >
        <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.trackFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: theme.colors.text,
              },
            ]}
          />
          <View
            style={[
              styles.thumb,
              {
                left: `${progress * 100}%`,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          />
        </View>
      </Pressable>

      <View style={[styles.timeRow, compact && styles.compactTimeRow]}>
        <Text style={[styles.timeText, { color: theme.colors.text }]}>{formatClock(positionMs)}</Text>
        <Pressable onPress={onChangeRate} disabled={disabled} style={styles.rateButton}>
          <Text style={[styles.rateText, { color: theme.colors.text }]}>{playbackRate.toFixed(1)}x</Text>
        </Pressable>
        <Text style={[styles.timeText, { color: theme.colors.text }]}>-{formatClock(remainingMs)}</Text>
      </View>

      <View style={[styles.controlsRow, compact && styles.compactControlsRow]}>
        <Pressable
          onPress={() => void onSkipBackward()}
          disabled={disabled}
          style={[
            styles.secondaryButton,
            compact && styles.compactSecondaryButton,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[styles.secondaryButtonText, compact && styles.compactSecondaryButtonText, { color: theme.colors.text }]}>
            -15
          </Text>
        </Pressable>

        <Pressable
          onPress={onTogglePlay}
          disabled={disabled || !isReady}
          style={[
            styles.primaryButton,
            compact && styles.compactPrimaryButton,
            {
              backgroundColor: theme.colors.text,
              opacity: disabled || !isReady ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryButtonText, compact && styles.compactPrimaryButtonText, { color: theme.colors.surface }]}>
            {playLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void onSkipForward()}
          disabled={disabled}
          style={[
            styles.secondaryButton,
            compact && styles.compactSecondaryButton,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[styles.secondaryButtonText, compact && styles.compactSecondaryButtonText, { color: theme.colors.text }]}>
            +15
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  trackHitArea: {
    paddingVertical: 6,
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  thumb: {
    position: 'absolute',
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
  },
  compactTimeRow: {
    marginBottom: 10,
  },
  timeText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  rateButton: {
    minWidth: 56,
    alignItems: 'center',
  },
  rateText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  compactControlsRow: {
    gap: 12,
  },
  secondaryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSecondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  secondaryButtonText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  compactSecondaryButtonText: {
    fontSize: 16,
  },
  primaryButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPrimaryButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  primaryButtonText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  compactPrimaryButtonText: {
    fontSize: 16,
  },
});
