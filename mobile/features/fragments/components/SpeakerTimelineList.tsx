import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
    <View style={[styles.container, { minHeight: windowHeight }]}>
      <ScrollView
        ref={scrollRef}
        style={[
          styles.window,
          compact && styles.windowCompact,
          {
            height: windowHeight,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
        contentContainerStyle={styles.windowContent}
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
                styles.segment,
                compact && styles.segmentCompact,
                {
                  backgroundColor: item.isActive
                    ? `${item.accentColor}08`
                    : pressed
                      ? theme.colors.surface
                      : 'transparent',
                },
              ]}
            >
              <View style={styles.segmentMetaRow}>
                <View style={[styles.speakerBadge, compact && styles.speakerBadgeCompact, { backgroundColor: `${item.accentColor}14` }]}>
                  <Text style={[styles.speakerBadgeText, compact && styles.speakerBadgeTextCompact, { color: item.accentColor }]}>
                    {item.speakerLabel}
                  </Text>
                </View>
                <View style={[styles.timePill, compact && styles.timePillCompact, { backgroundColor: theme.colors.surfaceMuted }]}>
                  <Text style={[styles.timeText, compact && styles.timeTextCompact, { color: item.accentColor }]}>
                    {item.timeLabel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.segmentText, compact && styles.segmentTextCompact, { color: theme.colors.text }]}>
                {item.text}
              </Text>
              {!isLast ? (
                <View style={[styles.segmentDivider, { backgroundColor: theme.colors.border }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  window: {
    borderWidth: 1,
    borderRadius: 18,
  },
  windowCompact: {
    borderRadius: 16,
  },
  windowContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 0,
  },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  segmentCompact: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  segmentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  timeText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  timeTextCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  timePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timePillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  speakerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  speakerBadgeCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  speakerBadgeText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  speakerBadgeTextCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  segmentText: {
    fontSize: 18,
    lineHeight: 34,
    fontWeight: '400',
  },
  segmentTextCompact: {
    fontSize: 15,
    lineHeight: 24,
  },
  segmentDivider: {
    height: 1,
    marginTop: 12,
  },
});
