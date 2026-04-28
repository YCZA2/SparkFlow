import type { Fragment } from '@/types/fragment';

/*定义碎片详情抽屉对外需要的最小数据面，避免页面层理解内部 section 结构。 */
export interface FragmentDetailSheetContent {
  audioFileUrl: string | null;
  transcript: string | null;
  speakerSegments: Fragment['speaker_segments'];
  summary: string | null;
  tags: string[] | null;
  systemPurpose: Fragment['system_purpose'];
  userPurpose: Fragment['user_purpose'];
  effectivePurpose: Fragment['effective_purpose'];
  systemTags: string[] | null;
  userTags: string[] | null;
  dismissedSystemTags: string[] | null;
  effectiveTags: string[];
}

/*统一描述碎片详情抽屉展示的只读元信息。 */
export interface FragmentDetailSheetMetadata {
  source: Fragment['source'];
  audioSource: Fragment['audio_source'] | null;
  createdAt: string;
  folderName: string;
  isFilmed: boolean;
  relatedScriptsCount: number;
}

/*把音频播放能力收口成抽屉可消费的控制协议。 */
export interface FragmentDetailSheetPlayer {
  isReady: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  isResolving: boolean;
  togglePlayback: () => void;
  seekTo: (positionMs: number) => void | Promise<void>;
  skipForward: () => void | Promise<void>;
  skipBackward: () => void | Promise<void>;
  cyclePlaybackRate: () => void;
  playSegment: (segment: NonNullable<Fragment['speaker_segments']>[number]) => Promise<void>;
}

/*把当前仍保留在碎片详情里的正文工具整理成独立配置。 */
export interface FragmentDetailSheetTools {
  supportsImages: boolean;
  isUploadingImage: boolean;
  onInsertImage: () => Promise<void>;
}

/*把抽屉动作统一定义成可直接绑定 UI 的回调集合。 */
export interface FragmentDetailSheetActions {
  isDeleting: boolean;
  onClose: () => void;
  onShoot: () => void;
  onOpenRelatedScripts: () => void;
  onDelete: () => void;
  onSetPurpose: (purpose: NonNullable<Fragment['effective_purpose']>) => Promise<void>;
  onAddUserTag: (tag: string) => Promise<void>;
  onRemoveUserTag: (tag: string) => Promise<void>;
  onAcceptSystemTag: (tag: string) => Promise<void>;
  onDismissSystemTag: (tag: string) => Promise<void>;
}

/*描述碎片详情抽屉完整 props，供壳层和 section 组件共用。 */
export interface FragmentDetailSheetProps {
  visible: boolean;
  content: FragmentDetailSheetContent;
  metadata: FragmentDetailSheetMetadata;
  activeSegmentIndex: number | null;
  player: FragmentDetailSheetPlayer;
  tools: FragmentDetailSheetTools;
  actions: FragmentDetailSheetActions;
}
