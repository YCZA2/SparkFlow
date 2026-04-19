import React from 'react';
import { type Href } from 'expo-router';

import { ContentEditorScaffold } from '@/features/editor/components/ContentEditorScaffold';
import { ContentRichEditor } from '@/features/editor/components/ContentRichEditor';
import { FragmentDetailSheet } from '@/features/fragments/components/FragmentDetailSheet';

import { useFragmentDetailScreen } from './useFragmentDetailScreen';

const FRAGMENT_EDITOR_CAPABILITIES = {
  supportsImages: true,
  supportsDetailSheet: true,
  supportsTitle: true,
  supportsAiTools: false,
} as const;

export function FragmentDetailScreen({
  fragmentId,
  exitTo,
  cleanupOnReturn,
}: {
  fragmentId?: string | null;
  exitTo?: Href | null;
  cleanupOnReturn?: 'empty_manual_placeholder' | null;
}) {
  /*碎片详情页只组装共享编辑壳层和 fragment 专属抽屉内容，接收来源路径用于删除后返回。 */
  const screen = useFragmentDetailScreen(fragmentId, { exitTo, cleanupOnReturn });
  const fragment = screen.resource.fragment;
  const editor = screen.editor;
  const sheet = screen.sheet;

  return (
    <>
      <ContentEditorScaffold
        capabilities={FRAGMENT_EDITOR_CAPABILITIES}
        isLoading={screen.resource.isLoading}
        error={screen.resource.error}
        isPendingBodyHydrated={editor.isPendingBodyHydrated}
        showDoneButton={editor.isEditorFocused}
        formattingState={editor.formattingState}
        statusLabel={editor.statusLabel}
        isUploadingImage={editor.isUploadingImage}
        editorRef={editor.editorRef}
        onBack={screen.actions.goBack}
        onDone={screen.actions.done}
        onRetry={() => {
          void screen.resource.reload();
        }}
        onShare={screen.actions.share}
        onOpenDetailSheet={sheet.open}
        onInsertImage={editor.onInsertImage}
        editor={
          <ContentRichEditor
            editorKey={editor.editorKey}
            editorRef={editor.editorRef}
            initialBodyHtml={editor.initialBodyHtml}
            autoFocus={editor.shouldAutoFocus}
            mediaAssets={editor.mediaAssets}
            onFocus={editor.onEditorFocus}
            onBlur={editor.onEditorBlur}
            onEditorReady={editor.onEditorReady}
            onSnapshotChange={editor.onSnapshotChange}
            onSelectionChange={editor.onSelectionChange}
            onFormattingStateChange={editor.onFormattingStateChange}
          />
        }
      />

      {sheet.isOpen && sheet.content && sheet.metadata && fragment ? (
        <FragmentDetailSheet
          visible={sheet.isOpen}
          content={sheet.content}
          metadata={sheet.metadata}
          activeSegmentIndex={sheet.activeSegmentIndex}
          player={sheet.player}
          tools={sheet.tools}
          actions={sheet.actions}
        />
      ) : null}
    </>
  );
}
