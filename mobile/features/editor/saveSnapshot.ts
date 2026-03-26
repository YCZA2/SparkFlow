import type { EditorDocumentSnapshot, EditorSurfaceHandle } from './types';

interface ResolveEditorSnapshotForSaveInput {
  editor: Pick<EditorSurfaceHandle, 'getSnapshot' | 'readSnapshot'> | null | undefined;
  fallbackSnapshot: EditorDocumentSnapshot;
}

export async function resolveEditorSnapshotForSave({
  editor,
  fallbackSnapshot,
}: ResolveEditorSnapshotForSaveInput): Promise<EditorDocumentSnapshot> {
  /*显式保存时优先读取桥接层最新 HTML，失败后再回落到内存中的最后快照。 */
  if (typeof editor?.readSnapshot === 'function') {
    try {
      const refreshedSnapshot = await editor.readSnapshot();
      if (refreshedSnapshot) {
        return refreshedSnapshot;
      }
    } catch {
      /*桥接读取失败时继续回退到内存快照，避免显式保存直接中断。 */
    }
  }

  return editor?.getSnapshot?.() ?? fallbackSnapshot;
}
