import React from 'react';
import { View } from 'react-native';

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
    <View className={dense ? 'gap-[10px]' : 'gap-sf-md'}>
      <Text className={dense ? 'text-lg font-bold leading-6' : 'text-[22px] font-bold leading-[30px]'}>
        语音原文
      </Text>
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
        <Text className="text-[15px] leading-6">
          {transcript || '暂无转写内容'}
        </Text>
      )}
    </View>
  );
}
