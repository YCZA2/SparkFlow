import React from 'react';

import { ContentEditorScaffold } from '@/features/editor/components/ContentEditorScaffold';
import { ContentRichEditor } from '@/features/editor/components/ContentRichEditor';
import { ScriptDetailSheet } from '@/features/scripts/components/ScriptDetailSheet';
import { useScriptDetailScreen } from '@/features/scripts/detail/useScriptDetailScreen';

const SCRIPT_EDITOR_CAPABILITIES = {
  supportsImages: false,
  supportsDetailSheet: true,
  supportsTitle: true,
  supportsAiTools: false,
} as const;

export function ScriptDetailScreen({ scriptId }: { scriptId?: string | null }) {
  /*脚本详情页复用共享编辑壳层，并把附加信息统一收进更多抽屉。 */
  const screen = useScriptDetailScreen(scriptId);
  const script = screen.resource.script;
  const editor = screen.editor;

  return (
    <>
      <ContentEditorScaffold
        capabilities={SCRIPT_EDITOR_CAPABILITIES}
        isLoading={screen.resource.isLoading}
        error={screen.resource.error}
        isPendingBodyHydrated={editor.isPendingBodyHydrated}
        showDoneButton={editor.isEditorFocused}
        formattingState={editor.formattingState}
        statusLabel={editor.statusLabel}
        editorRef={editor.editorRef}
        onBack={screen.actions.goBack}
        onDone={screen.actions.done}
        onRetry={() => {
          void screen.resource.reload();
        }}
        onShare={screen.actions.share}
        onOpenDetailSheet={screen.sheet.open}
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
      {script && screen.sheet.isOpen && screen.sheet.metadata ? (
        <ScriptDetailSheet
          visible={screen.sheet.isOpen}
          metadata={screen.sheet.metadata}
          sourceFragments={screen.sheet.sourceFragments}
          actions={screen.sheet.actions}
        />
      ) : null}
    </>
  );
}
