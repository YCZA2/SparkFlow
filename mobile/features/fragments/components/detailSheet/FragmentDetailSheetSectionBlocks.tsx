import React from 'react';
import { TouchableOpacity, View, Text, TextInput } from 'react-native';

import { FragmentAudioPlayerControls } from '@/features/fragments/components/FragmentAudioPlayerControls';
import { TranscriptSection } from '@/features/fragments/components/TranscriptSection';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import { FRAGMENT_PURPOSE_LABELS, FRAGMENT_PURPOSES, normalizeSemanticTags } from '@/features/fragments/semantics';
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
        <View className="mb-sf-xs">
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
          <Text className="text-sm leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
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
  const tags = normalizeFragmentTags(content.effectiveTags?.length ? content.effectiveTags : content.tags);
  const sourceLabel = getSourceLabel(metadata.source);
  const audioSourceLabel = getAudioSourceLabel(metadata.audioSource);

  return (
    <Section title="碎片信息">
      {content.summary ? (
        <InfoCard>
          <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">AI 摘要</Text>
          <Text className="mt-sf-sm text-base leading-6 text-app-text dark:text-app-text-dark">{content.summary}</Text>
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
          <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">标签</Text>
          <View className="mt-sf-sm flex-row flex-wrap gap-sf-sm">
            {tags.map((tag) => (
              <View key={tag} className="rounded-sf-pill bg-app-surface-muted px-[10px] py-[6px] dark:bg-app-surface-muted-dark">
                <Text className="text-xs font-semibold leading-4 text-app-text dark:text-app-text-dark">{tag}</Text>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}
    </Section>
  );
}

/*展示并编辑系统对碎片的用途与标签理解，让用户能轻量纠正。 */
export function SemanticSection({
  content,
  actions,
}: Pick<FragmentDetailSheetProps, 'content' | 'actions'>) {
  const [draftTag, setDraftTag] = React.useState('');
  const theme = useAppTheme();
  const userTags = normalizeSemanticTags(content.userTags);
  const dismissed = new Set(normalizeSemanticTags(content.dismissedSystemTags));
  const systemTags = normalizeSemanticTags(content.systemTags).filter((tag) => !dismissed.has(tag) && !userTags.includes(tag));

  const submitTag = () => {
    /*新增用户标签后清空输入，避免重复提交。 */
    const tag = draftTag.trim();
    if (!tag) {
      return;
    }
    setDraftTag('');
    void actions.onAddUserTag(tag);
  };

  return (
    <Section title="系统理解">
      <InfoCard>
        <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">主要用途</Text>
        <View className="mt-sf-sm flex-row flex-wrap gap-sf-sm">
          {FRAGMENT_PURPOSES.map((purpose) => {
            const selected = content.effectivePurpose === purpose;
            return (
              <TouchableOpacity
                key={purpose}
                className="rounded-sf-pill px-[10px] py-[6px]"
                style={{ backgroundColor: selected ? theme.colors.text : theme.colors.surfaceMuted }}
                activeOpacity={0.82}
                onPress={() => {
                  void actions.onSetPurpose(purpose);
                }}
              >
                <Text className="text-xs font-semibold leading-4" style={{ color: selected ? theme.colors.surface : theme.colors.text }}>
                  {FRAGMENT_PURPOSE_LABELS[purpose]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </InfoCard>

      <InfoCard>
        <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">用户标签</Text>
        <View className="mt-sf-sm flex-row flex-wrap gap-sf-sm">
          {userTags.map((tag) => (
            <TouchableOpacity
              key={tag}
              className="rounded-sf-pill bg-app-surface-muted px-[10px] py-[6px] dark:bg-app-surface-muted-dark"
              activeOpacity={0.82}
              onPress={() => {
                void actions.onRemoveUserTag(tag);
              }}
            >
              <Text className="text-xs font-semibold leading-4 text-app-text dark:text-app-text-dark">{tag} ×</Text>
            </TouchableOpacity>
          ))}
          {userTags.length === 0 ? (
            <Text className="text-sm leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">还没有用户标签。</Text>
          ) : null}
        </View>
        <View className="mt-sf-sm flex-row items-center gap-sf-sm">
          <TextInput
            value={draftTag}
            onChangeText={setDraftTag}
            placeholder="添加标签"
            placeholderTextColor={theme.colors.textSubtle}
            className="min-h-9 flex-1 rounded-sf-sm bg-app-surface-muted px-[10px] py-[6px] text-sm text-app-text dark:bg-app-surface-muted-dark dark:text-app-text-dark"
            onSubmitEditing={submitTag}
          />
          <TouchableOpacity className="rounded-sf-sm bg-app-text px-[12px] py-[8px] dark:bg-app-text-dark" onPress={submitTag} activeOpacity={0.82}>
            <Text className="text-xs font-bold text-app-surface dark:text-app-surface-dark">添加</Text>
          </TouchableOpacity>
        </View>
      </InfoCard>

      {systemTags.length > 0 ? (
        <InfoCard>
          <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">系统建议标签</Text>
          <View className="mt-sf-sm flex-row flex-wrap gap-sf-sm">
            {systemTags.map((tag) => (
              <View key={tag} className="flex-row items-center overflow-hidden rounded-sf-pill bg-app-surface-muted dark:bg-app-surface-muted-dark">
                <TouchableOpacity className="px-[10px] py-[6px]" activeOpacity={0.82} onPress={() => void actions.onAcceptSystemTag(tag)}>
                  <Text className="text-xs font-semibold leading-4 text-app-text dark:text-app-text-dark">{tag}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="border-l px-[8px] py-[6px] border-app-border dark:border-app-border-dark" activeOpacity={0.82} onPress={() => void actions.onDismissSystemTag(tag)}>
                  <Text className="text-xs font-bold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">×</Text>
                </TouchableOpacity>
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
        className="items-center justify-center rounded-[18px] border py-sf-lg bg-app-surface dark:bg-app-surface-dark"
        style={[
          {
            borderColor: theme.colors.danger,
            opacity: actions.isDeleting ? 0.65 : 1,
          },
        ]}
      >
        <Text className="text-[15px] font-bold leading-5 text-app-danger dark:text-app-danger-dark">
          {actions.isDeleting ? '删除中...' : '删除这条碎片'}
        </Text>
      </TouchableOpacity>
    </Section>
  );
}
