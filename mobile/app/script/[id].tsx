import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ScriptDetailScreen as ScriptDetailView } from '@/features/scripts/detail/ScriptDetailScreen';

export default function ScriptDetailScreenRoute() {
  /*路由层只负责读取脚本 id，并把真实页面实现下沉到 detail 模块。 */
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScriptDetailView scriptId={id ?? null} />;
}
