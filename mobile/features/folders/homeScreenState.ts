import React from 'react';
import { SymbolView } from 'expo-symbols';

import type { FragmentFolder } from '@/types/folder';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

export type HomeFolderRow = {
  kind: 'row';
  id: string;
  folder: FragmentFolder;
  icon: SymbolName;
  countLabel?: string;
  countValue: string;
  isFirstInSection: boolean;
  isLastInSection: boolean;
};

export type HomeFolderSection = {
  kind: 'section';
  id: string;
  title: string;
};

export type HomeFolderListItem = HomeFolderRow | HomeFolderSection;

/*统一映射首页系统文件夹图标，避免页面层散落字符串判断。 */
function getHomeFolderIcon(folderId: string): SymbolName {
  if (folderId === '__all__') return 'tray';
  if (folderId === '__scripts__') return 'doc.text';
  return 'folder';
}

/*把首页文件夹数据整理成可直接渲染的列表模型，并补齐 section 首尾信息。 */
export function buildHomeFolderListItems(input: {
  folders: FragmentFolder[];
  allFragmentsCount: number;
  allScriptsCount: number;
}): { total: number; items: HomeFolderListItem[] } {
  const allFolder: FragmentFolder = {
    id: '__all__',
    name: '全部',
    fragment_count: input.allFragmentsCount,
    created_at: null,
    updated_at: null,
  };
  const scriptFolder: FragmentFolder | null =
    input.allScriptsCount > 0
      ? {
          id: '__scripts__',
          name: '成稿',
          fragment_count: input.allScriptsCount,
          created_at: null,
          updated_at: null,
        }
      : null;
  const displayFolders = [allFolder, ...(scriptFolder ? [scriptFolder] : []), ...input.folders];

  const quickRows = displayFolders.slice(0, Math.min(displayFolders.length, 2)).map((folder, index, array) => ({
    kind: 'row' as const,
    id: folder.id,
    folder,
    icon: getHomeFolderIcon(folder.id),
    countLabel: folder.id === '__scripts__' ? `${folder.fragment_count} 篇成稿` : undefined,
    countValue: folder.fragment_count.toLocaleString('zh-CN'),
    isFirstInSection: index === 0,
    isLastInSection: index === array.length - 1,
  }));
  const folderRows = displayFolders.slice(2).map((folder, index, array) => ({
    kind: 'row' as const,
    id: folder.id,
    folder,
    icon: 'folder' as const,
    countValue: folder.fragment_count.toLocaleString('zh-CN'),
    isFirstInSection: index === 0,
    isLastInSection: index === array.length - 1,
  }));

  return {
    total: input.folders.length,
    items: [
      { kind: 'section', id: 'system', title: '系统' },
      ...quickRows,
      ...(folderRows.length > 0
        ? [{ kind: 'section' as const, id: 'folders', title: '文件夹' }, ...folderRows]
        : []),
    ],
  };
}
