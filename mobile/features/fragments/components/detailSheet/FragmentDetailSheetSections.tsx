import React from 'react';

import {
  ActionsSection,
  AudioTranscriptSection,
  DangerSection,
  MetadataSection,
  ToolsSection,
} from './FragmentDetailSheetSectionBlocks';
import type { FragmentDetailSheetProps } from './types';

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
