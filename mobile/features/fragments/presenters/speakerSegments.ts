import type { SpeakerSegment } from '@/types/fragment';

const SPEAKER_COLORS = ['#F26B3A', '#4FB4C8', '#7E57C2', '#1FA97A', '#C16A2D'];

export interface PresentedSpeakerSegment {
  key: string;
  originalIndex: number;
  originalSpeakerId: string;
  speakerOrder: number;
  speakerLabel: string;
  timeLabel: string;
  accentColor: string;
  startMs: number;
  endMs: number;
  text: string;
  isActive: boolean;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatSegmentTime(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function createSegmentKey(segment: SpeakerSegment, index: number): string {
  return `${segment.speaker_id}:${segment.start_ms}:${segment.end_ms}:${index}`;
}

export function presentSpeakerSegments(params: {
  segments: SpeakerSegment[];
  activeIndex?: number | null;
  activeSegmentId?: string | null;
}): PresentedSpeakerSegment[] {
  const { segments, activeIndex = null, activeSegmentId = null } = params;
  const speakerOrder = new Map<string, number>();

  return segments.map((segment, index) => {
    if (!speakerOrder.has(segment.speaker_id)) {
      speakerOrder.set(segment.speaker_id, speakerOrder.size + 1);
    }

    const order = speakerOrder.get(segment.speaker_id) ?? index + 1;
    const key = createSegmentKey(segment, index);
    const isActive = activeSegmentId ? activeSegmentId === key : activeIndex === index;

    return {
      key,
      originalIndex: index,
      originalSpeakerId: segment.speaker_id,
      speakerOrder: order,
      speakerLabel: `说话人 ${order}`,
      timeLabel: formatSegmentTime(segment.start_ms),
      accentColor: SPEAKER_COLORS[(order - 1) % SPEAKER_COLORS.length],
      startMs: segment.start_ms,
      endMs: segment.end_ms,
      text: segment.text,
      isActive,
    };
  });
}


export function getActiveSegmentIndex(segments: SpeakerSegment[], positionMs: number): number | null {
  if (!segments.length || positionMs < 0) {
    return null;
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (positionMs >= segment.start_ms && positionMs < segment.end_ms) {
      return index;
    }
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (positionMs >= segments[index].start_ms) {
      return index;
    }
  }

  return null;
}
