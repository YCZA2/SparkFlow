import React from 'react';
import { TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import { FragmentAudioPlayerControls } from '@/features/fragments/components/FragmentAudioPlayerControls';
import { TranscriptSection } from '@/features/fragments/components/TranscriptSection';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import { useAppTheme } from '@/theme/useAppTheme';
import { formatDate } from '@/utils/date';

import {
  getAudioSourceLabel,
  getSourceLabel,
  InfoCard,
  InfoRow,
  Section,
  ToolRow,
} from './FragmentDetailSheetPrimitives';
import { fragmentDetailSheetStyles as styles } from './fragmentDetailSheetStyles';
import type { FragmentDetailSheetProps } from './types';

/*单独渲染原文与音频区块，确保说话人分段可以直接回放。 */
export function AudioTranscriptSection({
  content,
  activeSegmentIndex,
  player,
}: Pick<FragmentDetailSheetProps, 'content' | 'activeSegmentIndex' | 'player'>) {
  const theme = useAppTheme();
  const hasAudio = Boolean(content.audioFileUrl);

  return (
    <Section title="原文与音频">
      {hasAudio ? (
        <View style={styles.audioSection}>
          <FragmentAudioPlayerControls
            isReady={player.isReady}
            isPlaying={player.isPlaying}
            positionMs={player.positionMs}
            durationMs={player.durationMs}
            playbackRate={player.playbackRate}
            disabled={player.isResolving}
            compact={true}
            onTogglePlay={player.togglePlayback}
            onSeek={player.seekTo}
            onSkipForward={player.skipForward}
            onSkipBackward={player.skipBackward}
            onChangeRate={player.cyclePlaybackRate}
          />
        </View>
      ) : null}

      {!hasAudio ? (
        <InfoCard>
          <Text style={[styles.emptyText, { color: theme.colors.textSubtle }]}>
            这条碎片没有可播放的音频。
          </Text>
        </InfoCard>
      ) : null}

      <TranscriptSection
        transcript={content.transcript}
        speakerSegments={content.speakerSegments}
        audioPath={content.audioFileUrl}
        activeIndex={activeSegmentIndex}
        dense={true}
        onSegmentPress={({ segment }) => {
          void player.playSegment(segment);
        }}
      />
    </Section>
  );
}

/*把正文整理工具收口成独立区块，避免和信息区混排。 */
export function ToolsSection({ tools }: Pick<FragmentDetailSheetProps, 'tools'>) {
  if (!tools.supportsImages) return null;

  return (
    <Section title="整理工具">
      <ToolRow
        icon="photo"
        title={tools.isUploadingImage ? '正在插图' : '插入图片'}
        subtitle="把图片插进正文，和笔记内容一起保存。"
        onPress={() => {
          void tools.onInsertImage();
        }}
        disabled={tools.isUploadingImage}
      />
    </Section>
  );
}

/*把拍摄和关联成稿入口收进快捷操作，保持详情主舞台简洁。 */
export function ActionsSection({
  metadata,
  actions,
}: Pick<FragmentDetailSheetProps, 'metadata' | 'actions'>) {
  return (
    <Section title="快捷操作">
      <ToolRow
        icon="video"
        title="进入拍摄"
        subtitle="直接使用当前正文作为提词内容开始拍摄。"
        onPress={actions.onShoot}
      />
      <ToolRow
        icon="text.document"
        title="查看关联成稿"
        subtitle={
          metadata.relatedScriptsCount > 0
            ? `已找到 ${metadata.relatedScriptsCount} 篇来源包含这条碎片的成稿。`
            : '还没有关联成稿，之后生成的稿件会出现在这里。'
        }
        onPress={actions.onOpenRelatedScripts}
      />
    </Section>
  );
}

/*把摘要、来源、标签等只读信息集中展示，避免散落在多个入口。 */
export function MetadataSection({
  content,
  metadata,
}: Pick<FragmentDetailSheetProps, 'content' | 'metadata'>) {
  const theme = useAppTheme();
  const tags = normalizeFragmentTags(content.tags);
  const sourceLabel = getSourceLabel(metadata.source);
  const audioSourceLabel = getAudioSourceLabel(metadata.audioSource);

  return (
    <Section title="碎片信息">
      {content.summary ? (
        <InfoCard>
          <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>AI 摘要</Text>
          <Text style={[styles.summaryText, { color: theme.colors.text }]}>{content.summary}</Text>
        </InfoCard>
      ) : null}

      <InfoCard>
        <InfoRow label="来源" value={sourceLabel} />
        {audioSourceLabel ? <InfoRow label="音频来源" value={audioSourceLabel} /> : null}
        <InfoRow label="创建时间" value={formatDate(metadata.createdAt)} />
        <InfoRow label="文件夹" value={metadata.folderName} />
        <InfoRow label="拍摄状态" value={metadata.isFilmed ? '已拍摄' : '未拍摄'} />
      </InfoCard>

      {tags.length > 0 ? (
        <InfoCard>
          <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>标签</Text>
          <View style={styles.tagsWrap}>
            {tags.map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Text style={[styles.tagText, { color: theme.colors.text }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}
    </Section>
  );
}

/*把删除入口独立为危险区块，降低误触和信息干扰。 */
export function DangerSection({ actions }: Pick<FragmentDetailSheetProps, 'actions'>) {
  const theme = useAppTheme();

  return (
    <Section title="危险操作">
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={actions.onDelete}
        disabled={actions.isDeleting}
        style={[
          styles.deleteButton,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.danger,
            opacity: actions.isDeleting ? 0.65 : 1,
          },
        ]}
      >
        <Text style={[styles.deleteText, { color: theme.colors.danger }]}>
          {actions.isDeleting ? '删除中...' : '删除这条碎片'}
        </Text>
      </TouchableOpacity>
    </Section>
  );
}
