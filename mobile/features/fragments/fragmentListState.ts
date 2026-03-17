import type { Fragment } from '@/types/fragment';

export interface FragmentSection {
  title: string;
  data: Fragment[];
}

/*统一解析列表排序时间，优先使用最后修改时间，没有时再回退创建时间。 */
function resolveFragmentSortDate(fragment: Fragment): string {
  return fragment.updated_at || fragment.created_at;
}

export function buildFragmentSections(fragments: Fragment[]): FragmentSection[] {
  /*把碎片按最后修改时间分段，确保历史碎片被编辑后按最新修改位置展示。 */
  const sectionMap = new Map<string, Fragment[]>();
  const sortedFragments = [...fragments].sort(
    (left, right) =>
      Date.parse(resolveFragmentSortDate(right)) - Date.parse(resolveFragmentSortDate(left))
  );

  for (const fragment of sortedFragments) {
    const key = getSectionLabel(resolveFragmentSortDate(fragment));
    const current = sectionMap.get(key) ?? [];
    current.push(fragment);
    sectionMap.set(key, current);
  }

  /*每个分组内继续按最后修改时间倒序排列，避免组内顺序回退到创建时间。 */
  return Array.from(sectionMap.entries()).map(([title, data]) => ({
    title,
    data: data.sort(
      (left, right) =>
        Date.parse(resolveFragmentSortDate(right)) - Date.parse(resolveFragmentSortDate(left))
    ),
  }));
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
