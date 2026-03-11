import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';
import { FragmentAudioPlayerControls } from './FragmentAudioPlayerControls';

interface FragmentAudioPlayerProps {
  isReady: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  disabled?: boolean;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void | Promise<void>;
  onSkipForward: () => void | Promise<void>;
  onSkipBackward: () => void | Promise<void>;
  onChangeRate: () => void;
}

export function FragmentAudioPlayer({
  isReady,
  isPlaying,
  positionMs,
  durationMs,
  playbackRate,
  disabled = false,
  onTogglePlay,
  onSeek,
  onSkipForward,
  onSkipBackward,
  onChangeRate,
}: FragmentAudioPlayerProps) {
  /*为音频控制区提供固定底栏容器，供旧页面布局继续复用。 */
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.colors.background,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopColor: theme.colors.border,
        },
      ]}
    >
      <FragmentAudioPlayerControls
        isReady={isReady}
        isPlaying={isPlaying}
        positionMs={positionMs}
        durationMs={durationMs}
        playbackRate={playbackRate}
        disabled={disabled}
        onTogglePlay={onTogglePlay}
        onSeek={onSeek}
        onSkipForward={onSkipForward}
        onSkipBackward={onSkipBackward}
        onChangeRate={onChangeRate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
