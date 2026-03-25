import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { SpeakerTimelineList } from '@/features/fragments/components/SpeakerTimelineList';
import type { SpeakerSegment } from '@/types/fragment';

interface TranscriptSectionProps {
  transcript: string | null;
  speakerSegments: SpeakerSegment[] | null;
  audioPath?: string | null;
  activeIndex?: number | null;
  activeSegmentId?: string | null;
  dense?: boolean;
  onSegmentPress?: (payload: { segment: SpeakerSegment; index: number; audioPath?: string | null }) => void;
}

export function TranscriptSection({
  transcript,
  speakerSegments,
  audioPath = null,
  activeIndex = null,
  activeSegmentId = null,
  dense = false,
  onSegmentPress,
}: TranscriptSectionProps) {
  /*在抽屉或详情页内渲染原文区，支持紧凑样式复用。 */
  const hasSpeakerSegments = Boolean(speakerSegments && speakerSegments.length > 0);

  return (
    <View style={[styles.section, dense && styles.sectionDense]}>
      <Text style={[styles.title, dense && styles.titleDense]}>语音原文</Text>
      {hasSpeakerSegments ? (
        <SpeakerTimelineList
          segments={speakerSegments ?? []}
          audioPath={audioPath}
          activeIndex={activeIndex}
          activeSegmentId={activeSegmentId}
          compact={dense}
          onSegmentPress={onSegmentPress}
        />
      ) : (
        <Text style={styles.transcriptText}>
          {transcript || '暂无转写内容'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionDense: {
    gap: 10,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  titleDense: {
    fontSize: 18,
    lineHeight: 24,
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 24,
  },
});
