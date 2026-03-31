import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { FragmentAudioPlayerControls } from '@/features/fragments/components/FragmentAudioPlayerControls';
import { TranscriptSection } from '@/features/fragments/components/TranscriptSection';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import { useAppTheme } from '@/theme/useAppTheme';
import { formatDate } from '@/utils/date';

import type { FragmentDetailSheetProps } from './types';

/*统一映射碎片来源文案，避免 section 组件各自判断。 */
function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音记录',
    manual: '文字记录',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

/*统一映射音频来源文案，减少元信息区块的条件分支噪音。 */
function getAudioSourceLabel(audioSource: FragmentDetailSheetProps['metadata']['audioSource']): string | null {
  if (audioSource === 'external_link') return '外链导入';
  if (audioSource === 'upload') return '本地上传';
  return null;
}

function ToolRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  /*渲染抽屉内的动作行，统一按钮密度和视觉层级。 */
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toolRow,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View style={[styles.toolIcon, { backgroundColor: theme.colors.surfaceMuted }]}>
        <SymbolView name={icon} size={18} tintColor={theme.colors.primary} />
      </View>
      <View style={styles.toolCopy}>
        <Text style={[styles.toolTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.toolSubtitle, { color: theme.colors.textSubtle }]}>{subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={theme.colors.textSubtle} />
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  /*统一区块标题与内容间距，让 section 组合保持稳定节奏。 */
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  /*统一只读卡片容器，避免多个区块重复拼主题样式。 */
  const theme = useAppTheme();

  return (
    <View style={[styles.infoCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  /*展示单行碎片元信息，保持标签和值的阅读对齐。 */
  const theme = useAppTheme();

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

function AudioTranscriptSection({
  content,
  activeSegmentIndex,
  player,
}: Pick<FragmentDetailSheetProps, 'content' | 'activeSegmentIndex' | 'player'>) {
  /*单独渲染原文与音频区块，确保说话人分段可以直接回放。 */
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

function ToolsSection({ tools }: Pick<FragmentDetailSheetProps, 'tools'>) {
  /*把正文整理工具收口成独立区块，避免和信息区混排。 */
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

function ActionsSection({
  metadata,
  actions,
}: Pick<FragmentDetailSheetProps, 'metadata' | 'actions'>) {
  /*把拍摄和关联成稿入口收进快捷操作，保持详情主舞台简洁。 */
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

function MetadataSection({
  content,
  metadata,
}: Pick<FragmentDetailSheetProps, 'content' | 'metadata'>) {
  /*把摘要、来源、标签等只读信息集中展示，避免散落在多个入口。 */
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

function DangerSection({ actions }: Pick<FragmentDetailSheetProps, 'actions'>) {
  /*把删除入口独立为危险区块，降低误触和信息干扰。 */
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

/*把抽屉内容稳定收敛为 section 组合，供外层 modal 壳层直接挂载。 */
export function FragmentDetailSheetSections(props: Omit<FragmentDetailSheetProps, 'visible'>) {
  return (
    <>
      <AudioTranscriptSection
        content={props.content}
        activeSegmentIndex={props.activeSegmentIndex}
        player={props.player}
      />
      <ToolsSection tools={props.tools} />
      <ActionsSection metadata={props.metadata} actions={props.actions} />
      <MetadataSection content={props.content} metadata={props.metadata} />
      <DangerSection actions={props.actions} />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  audioSection: {
    marginBottom: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolCopy: {
    flex: 1,
    marginRight: 10,
  },
  toolTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  toolSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  infoCard: {
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  infoValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  summaryText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  deleteButton: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
