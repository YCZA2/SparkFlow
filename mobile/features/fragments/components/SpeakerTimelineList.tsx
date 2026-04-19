import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/Themed';
import { presentSpeakerSegments } from '@/features/fragments/presenters/speakerSegments';
import { useAppTheme } from '@/theme/useAppTheme';
import type { SpeakerSegment } from '@/types/fragment';

const AUTO_SCROLL_COOLDOWN_MS = 2500;
const TIMELINE_WINDOW_HEIGHT = 420;
const COMPACT_TIMELINE_WINDOW_HEIGHT = 300;

interface SpeakerTimelineListProps {
  segments: SpeakerSegment[];
  audioPath?: string | null;
  activeIndex?: number | null;
  activeSegmentId?: string | null;
  compact?: boolean;
  onSegmentPress?: (payload: { segment: SpeakerSegment; index: number; audioPath?: string | null }) => void;
}

export function SpeakerTimelineList({
  segments,
  audioPath = null,
  activeIndex = null,
  activeSegmentId = null,
  compact = false,
  onSegmentPress,
}: SpeakerTimelineListProps) {
  /*渲染可跟随播放高亮的说话人时间线，支持抽屉内紧凑模式。 */
  const theme = useAppTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportHeightRef = useRef(0);
  const activeIndexRef = useRef<number | null>(activeIndex);
  const lastManualScrollAtRef = useRef(0);
  const layoutsRef = useRef<Record<number, { y: number; height: number }>>({});
  const presentedSegments = presentSpeakerSegments({ segments, activeIndex, activeSegmentId });
  const windowHeight = compact ? COMPACT_TIMELINE_WINDOW_HEIGHT : TIMELINE_WINDOW_HEIGHT;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const layout = layoutsRef.current[activeIndex];
    if (!layout) {
      return;
    }

    if (Date.now() - lastManualScrollAtRef.current < AUTO_SCROLL_COOLDOWN_MS) {
      return;
    }

    const viewportHeight = viewportHeightRef.current || windowHeight;
    const targetY = Math.max(0, layout.y - Math.max(24, viewportHeight * 0.25));
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, [activeIndex, presentedSegments, windowHeight]);

  return (
    <View className="overflow-hidden" style={{ minHeight: windowHeight }}>
      <ScrollView
        ref={scrollRef}
        className="rounded-[18px] border bg-app-surface-muted dark:bg-app-surface-muted-dark"
        style={{
          height: windowHeight,
          borderColor: theme.colors.border,
          borderRadius: compact ? 16 : 18,
          backgroundColor: theme.colors.surfaceMuted,
        }}
        contentContainerClassName="px-3 py-3"
        showsVerticalScrollIndicator={false}
        onLayout={(event) => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          lastManualScrollAtRef.current = Date.now();
        }}
        onMomentumScrollBegin={() => {
          lastManualScrollAtRef.current = Date.now();
        }}
        scrollEventThrottle={16}
      >
        {presentedSegments.map((item) => {
          const segment = segments[item.originalIndex];
          const isLast = item.originalIndex === presentedSegments.length - 1;
          return (
            <Pressable
              key={item.key}
              onLayout={(event) => {
                layoutsRef.current[item.originalIndex] = {
                  y: event.nativeEvent.layout.y,
                  height: event.nativeEvent.layout.height,
                };

                if (activeIndexRef.current === item.originalIndex && Date.now() - lastManualScrollAtRef.current >= AUTO_SCROLL_COOLDOWN_MS) {
                  const viewportHeight = viewportHeightRef.current || windowHeight;
                  const targetY = Math.max(0, event.nativeEvent.layout.y - Math.max(24, viewportHeight * 0.25));
                  scrollRef.current?.scrollTo({ y: targetY, animated: false });
                }
              }}
              onPress={onSegmentPress ? () => onSegmentPress({ segment, index: item.originalIndex, audioPath }) : undefined}
              style={({ pressed }) => [
                {
                  paddingVertical: compact ? 8 : 10,
                  paddingHorizontal: 2,
                },
                {
                  backgroundColor: item.isActive
                    ? `${item.accentColor}08`
                    : pressed
                      ? theme.colors.surface
                      : 'transparent',
                },
              ]}
            >
              <View className="mb-2.5 flex-row items-center justify-between gap-2.5">
                <View
                  className="self-start rounded-full px-3 py-1.5"
                  style={[
                    {
                      backgroundColor: `${item.accentColor}14`,
                    },
                    compact ? { paddingHorizontal: 10, paddingVertical: 5 } : null,
                  ]}
                >
                  <Text
                    className="font-extrabold"
                    style={[
                      {
                        color: item.accentColor,
                        fontSize: compact ? 12 : 13,
                        lineHeight: compact ? 14 : 16,
                      },
                    ]}
                  >
                    {item.speakerLabel}
                  </Text>
                </View>
                <View
                  className="rounded-full bg-app-surface-muted px-2.5 py-1.5 dark:bg-app-surface-muted-dark"
                  style={compact ? { paddingHorizontal: 8, paddingVertical: 5 } : null}
                >
                  <Text
                    className="font-bold"
                    style={[
                      {
                        color: item.accentColor,
                        fontSize: compact ? 12 : 13,
                        lineHeight: compact ? 14 : 16,
                      },
                    ]}
                  >
                    {item.timeLabel}
                  </Text>
                </View>
              </View>
              <Text
                className="text-app-text dark:text-app-text-dark"
                style={{ fontSize: compact ? 15 : 18, lineHeight: compact ? 24 : 34, fontWeight: '400' }}
              >
                {item.text}
              </Text>
              {!isLast ? (
                <View className="mt-3 h-px" style={{ backgroundColor: theme.colors.border }} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
