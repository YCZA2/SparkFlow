import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { presentSpeakerSegments } from '@/features/fragments/presenters/speakerSegments';
import { useAppTheme } from '@/theme/useAppTheme';
import type { SpeakerSegment } from '@/types/fragment';

const AUTO_SCROLL_COOLDOWN_MS = 2500;
const TIMELINE_WINDOW_HEIGHT = 420;

interface SpeakerTimelineListProps {
  segments: SpeakerSegment[];
  audioPath?: string | null;
  activeIndex?: number | null;
  activeSegmentId?: string | null;
  onSegmentPress?: (payload: { segment: SpeakerSegment; index: number; audioPath?: string | null }) => void;
}

export function SpeakerTimelineList({
  segments,
  audioPath = null,
  activeIndex = null,
  activeSegmentId = null,
  onSegmentPress,
}: SpeakerTimelineListProps) {
  const theme = useAppTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportHeightRef = useRef(0);
  const activeIndexRef = useRef<number | null>(activeIndex);
  const lastManualScrollAtRef = useRef(0);
  const layoutsRef = useRef<Record<number, { y: number; height: number }>>({});
  const presentedSegments = presentSpeakerSegments({ segments, activeIndex, activeSegmentId });

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

    const viewportHeight = viewportHeightRef.current || TIMELINE_WINDOW_HEIGHT;
    const targetY = Math.max(0, layout.y - Math.max(24, viewportHeight * 0.25));
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, [activeIndex, presentedSegments]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={[styles.window, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
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
          return (
            <Pressable
              key={item.key}
              onLayout={(event) => {
                layoutsRef.current[item.originalIndex] = {
                  y: event.nativeEvent.layout.y,
                  height: event.nativeEvent.layout.height,
                };

                if (activeIndexRef.current === item.originalIndex && Date.now() - lastManualScrollAtRef.current >= AUTO_SCROLL_COOLDOWN_MS) {
                  const viewportHeight = viewportHeightRef.current || TIMELINE_WINDOW_HEIGHT;
                  const targetY = Math.max(0, event.nativeEvent.layout.y - Math.max(24, viewportHeight * 0.25));
                  scrollRef.current?.scrollTo({ y: targetY, animated: false });
                }
              }}
              onPress={onSegmentPress ? () => onSegmentPress({ segment, index: item.originalIndex, audioPath }) : undefined}
              style={({ pressed }) => [
                styles.segment,
                {
                  backgroundColor: item.isActive
                    ? `${item.accentColor}16`
                    : pressed
                      ? theme.colors.surface
                      : 'transparent',
                  borderColor: item.isActive ? `${item.accentColor}30` : 'transparent',
                },
              ]}
            >
              <Text style={[styles.timeText, { color: item.accentColor }]}>{item.timeLabel}</Text>
              <View style={[styles.speakerBadge, { backgroundColor: `${item.accentColor}14` }]}>
                <Text style={[styles.speakerBadgeText, { color: item.accentColor }]}>{item.speakerLabel}</Text>
              </View>
              <Text style={[styles.segmentText, { color: theme.colors.text }]}>{item.text}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TIMELINE_WINDOW_HEIGHT,
  },
  window: {
    height: TIMELINE_WINDOW_HEIGHT,
    borderWidth: 1,
    borderRadius: 18,
  },
  windowContent: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 18,
  },
  segment: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  timeText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  speakerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  speakerBadgeText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  segmentText: {
    fontSize: 18,
    lineHeight: 34,
    fontWeight: '400',
  },
});
