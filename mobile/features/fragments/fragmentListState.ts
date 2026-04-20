import type { Fragment } from '@/types/fragment';
import { formatDateSectionLabel } from '@/utils/date';

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
    const key = formatDateSectionLabel(resolveFragmentSortDate(fragment));
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
