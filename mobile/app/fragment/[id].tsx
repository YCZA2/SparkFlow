import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { FragmentDetailScreen as FragmentDetailView } from '@/features/fragments/detail/FragmentDetailScreen';

export default function FragmentDetailScreen() {
  /*路由层只负责读取 fragment id 和来源文件夹信息，并把真实页面实现下沉到 feature detail 模块。 */
  const { id, folderId, folderName } = useLocalSearchParams<{
    id: string;
    folderId?: string;
    folderName?: string;
  }>();

  // 根据来源构建返回路径（包含文件夹名称）
  const exitTo = folderId
    ? {
        pathname: '/folder/[id]' as const,
        params: { id: folderId, name: folderName || '' },
      }
    : null;

  return <FragmentDetailView fragmentId={id ?? null} exitTo={exitTo} />;
}
