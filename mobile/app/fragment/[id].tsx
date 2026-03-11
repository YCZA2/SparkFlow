import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { FragmentDetailScreen as FragmentDetailView } from '@/features/fragments/detail/FragmentDetailScreen';

export default function FragmentDetailScreen() {
  /** 中文注释：路由层只负责读取 fragment id，并把真实页面实现下沉到 feature detail 模块。 */
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FragmentDetailView fragmentId={id ?? null} />;
}
