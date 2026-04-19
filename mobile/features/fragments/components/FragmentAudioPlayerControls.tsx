import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';

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
  /*渲染可复用的音频控制区，支持详情页抽屉和固定底栏两种容器。 */
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
      className="rounded-[18px] bg-app-surface px-4 py-3 dark:bg-app-surface-dark"
      style={[
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
        className="py-1.5"
        disabled={disabled}
      >
        <View className="relative h-1.5 justify-center rounded-full" style={{ backgroundColor: theme.colors.border }}>
          <View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                borderRadius: 999,
              },
              {
                width: `${progress * 100}%`,
                backgroundColor: theme.colors.text,
              },
            ]}
          />
          <View
            style={[
              {
                position: 'absolute',
                top: -6,
                marginLeft: -8,
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 1,
              },
              {
                left: `${progress * 100}%`,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          />
        </View>
      </Pressable>

      <View className="mb-3 mt-1 flex-row items-center justify-between" style={compact ? { marginBottom: 10 } : null}>
        <Text className="text-sm font-semibold leading-[18px] text-app-text dark:text-app-text-dark">
          {formatClock(positionMs)}
        </Text>
        <Pressable onPress={onChangeRate} disabled={disabled} className="min-w-14 items-center">
          <Text className="text-[15px] font-bold leading-[18px] text-app-text dark:text-app-text-dark">
            {playbackRate.toFixed(1)}x
          </Text>
        </Pressable>
        <Text className="text-sm font-semibold leading-[18px] text-app-text dark:text-app-text-dark">
          -{formatClock(remainingMs)}
        </Text>
      </View>

      <View className="flex-row items-center justify-center gap-4" style={compact ? { gap: 12 } : null}>
        <Pressable
          onPress={() => void onSkipBackward()}
          disabled={disabled}
          className="items-center justify-center rounded-full bg-app-surface-muted dark:bg-app-surface-muted-dark"
          style={{
            backgroundColor: theme.colors.surfaceMuted,
            opacity: disabled ? 0.45 : 1,
            width: compact ? 48 : 54,
            height: compact ? 48 : 54,
            borderRadius: compact ? 24 : 27,
          }}
        >
          <Text
            className="font-bold text-app-text dark:text-app-text-dark"
            style={{ fontSize: compact ? 16 : 18, lineHeight: compact ? 18 : 20 }}
          >
            -15
          </Text>
        </Pressable>

        <Pressable
          onPress={onTogglePlay}
          disabled={disabled || !isReady}
          className="items-center justify-center rounded-full bg-app-text dark:bg-app-text-dark"
          style={{
            backgroundColor: theme.colors.text,
            opacity: disabled || !isReady ? 0.45 : 1,
            width: compact ? 64 : 74,
            height: compact ? 64 : 74,
            borderRadius: compact ? 32 : 37,
          }}
        >
          <Text
            className="font-bold text-app-surface dark:text-app-surface-dark"
            style={[
              {
                color: theme.colors.surface,
                fontSize: compact ? 16 : 18,
                lineHeight: compact ? 18 : 20,
              },
            ]}
          >
            {playLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void onSkipForward()}
          disabled={disabled}
          className="items-center justify-center rounded-full bg-app-surface-muted dark:bg-app-surface-muted-dark"
          style={{
            backgroundColor: theme.colors.surfaceMuted,
            opacity: disabled ? 0.45 : 1,
            width: compact ? 48 : 54,
            height: compact ? 48 : 54,
            borderRadius: compact ? 24 : 27,
          }}
        >
          <Text
            className="font-bold text-app-text dark:text-app-text-dark"
            style={{ fontSize: compact ? 16 : 18, lineHeight: compact ? 18 : 20 }}
          >
            +15
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
