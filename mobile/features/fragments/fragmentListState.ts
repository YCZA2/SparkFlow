import type { Fragment } from '@/types/fragment';

export interface FragmentSection {
  title: string;
  data: Fragment[];
}

export function buildFragmentSections(fragments: Fragment[]): FragmentSection[] {
  /*把碎片按日期分段，统一首页与文件夹页的列表展示结构。 */
  const sectionMap = new Map<string, Fragment[]>();

  for (const fragment of fragments) {
    const key = getSectionLabel(fragment.created_at);
    const current = sectionMap.get(key) ?? [];
    current.push(fragment);
    sectionMap.set(key, current);
  }

  return Array.from(sectionMap.entries()).map(([title, data]) => ({ title, data }));
}

function getSectionLabel(dateString: string): string {
  /*把创建时间映射为列表分组标题，保持首页与文件夹页一致。 */
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '更早';

  const today = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((current.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
