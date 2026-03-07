import { useCallback, useEffect, useMemo, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import type { SpeakerSegment } from '@/types/fragment';
import { resolveFragmentAudioUrl } from '@/features/fragments/utils/audio';

const SKIP_INTERVAL_MS = 15_000;
const PLAYBACK_RATES = [1, 1.5, 2] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function toMilliseconds(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

export function useFragmentAudioPlayer(audioPath: string | null | undefined) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function resolveUrl() {
      setIsResolving(Boolean(audioPath));
      try {
        const nextUrl = await resolveFragmentAudioUrl(audioPath);
        if (mounted) {
          setAudioUrl(nextUrl);
        }
      } catch (error) {
        console.error('解析音频 URL 失败:', error);
        if (mounted) {
          setAudioUrl(null);
        }
      } finally {
        if (mounted) {
          setIsResolving(false);
        }
      }
    }

    resolveUrl();
    return () => {
      mounted = false;
    };
  }, [audioPath]);

  const source = useMemo(() => (audioUrl ? { uri: audioUrl } : null), [audioUrl]);
  const player = useAudioPlayer(source, { updateInterval: 250, keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    }).catch((error) => {
      console.error('配置播放器音频模式失败:', error);
    });

    return () => {
      setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      }).catch((error) => {
        console.error('恢复录音音频模式失败:', error);
      });
    };
  }, []);

  const durationMs = toMilliseconds(status.duration ?? 0);
  const positionMs = toMilliseconds(status.currentTime ?? 0);
  const playbackRate = status.playbackRate ?? 1;
  const isReady = Boolean(audioUrl) && status.isLoaded;
  const isPlaying = Boolean(status.playing);

  const seekTo = useCallback(
    async (nextPositionMs: number) => {
      const bounded = clamp(nextPositionMs, 0, durationMs || nextPositionMs);
      try {
        await player.seekTo(bounded / 1000);
      } catch (error) {
        console.error('音频跳转失败:', error);
      }
    },
    [durationMs, player]
  );

  const play = useCallback(() => {
    if (!audioUrl) return;
    player.play();
  }, [audioUrl, player]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    if (isPlaying) {
      player.pause();
      return;
    }
    player.play();
  }, [audioUrl, isPlaying, player]);

  const skipForward = useCallback(async () => {
    await seekTo(positionMs + SKIP_INTERVAL_MS);
  }, [positionMs, seekTo]);

  const skipBackward = useCallback(async () => {
    await seekTo(positionMs - SKIP_INTERVAL_MS);
  }, [positionMs, seekTo]);

  const cyclePlaybackRate = useCallback(() => {
    const currentIndex = PLAYBACK_RATES.findIndex((rate) => Math.abs(rate - playbackRate) < 0.01);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] ?? PLAYBACK_RATES[0];
    player.setPlaybackRate(nextRate);
  }, [playbackRate, player]);

  const playSegment = useCallback(
    async (segment: SpeakerSegment) => {
      await seekTo(segment.start_ms);
      player.play();
    },
    [player, seekTo]
  );

  return {
    audioUrl,
    isResolving,
    isReady,
    isPlaying,
    positionMs,
    durationMs,
    playbackRate,
    togglePlayback,
    play,
    pause,
    seekTo,
    skipForward,
    skipBackward,
    cyclePlaybackRate,
    playSegment,
  };
}
