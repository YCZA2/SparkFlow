import type { Fragment, FragmentPurpose } from '@/types/fragment';

export const FRAGMENT_PURPOSES: FragmentPurpose[] = [
  'content_material',
  'style_reference',
  'methodology',
  'case_study',
  'product_info',
  'other',
];

export const FRAGMENT_PURPOSE_LABELS: Record<FragmentPurpose, string> = {
  content_material: '内容素材',
  style_reference: '风格参考',
  methodology: '方法论',
  case_study: '案例',
  product_info: '产品资料',
  other: '待判断 / 其他',
};

/*判断输入是否为当前支持的 fragment 主要用途。 */
export function isFragmentPurpose(value: unknown): value is FragmentPurpose {
  return typeof value === 'string' && FRAGMENT_PURPOSES.includes(value as FragmentPurpose);
}

/*把任意输入规整为可保存的 fragment 主要用途。 */
export function normalizeFragmentPurpose(value: unknown): FragmentPurpose | null {
  return isFragmentPurpose(value) ? value : null;
}

/*返回生成和展示时实际采用的主要用途，用户修正优先。 */
export function getEffectiveFragmentPurpose(fragment: Pick<Fragment, 'user_purpose' | 'system_purpose'>): FragmentPurpose {
  return fragment.user_purpose ?? fragment.system_purpose ?? 'other';
}

/*把标签去空、去重并保持原输入顺序。 */
export function normalizeSemanticTags(tags: string[] | null | undefined): string[] {
  const normalized: string[] = [];
  for (const item of tags ?? []) {
    const tag = typeof item === 'string' ? item.trim() : '';
    if (!tag || normalized.includes(tag)) {
      continue;
    }
    normalized.push(tag);
  }
  return normalized;
}

/*合并用户标签和未删除的系统建议标签，供列表、筛选和生成读取。 */
export function getEffectiveFragmentTags(
  fragment: Pick<Fragment, 'tags' | 'system_tags' | 'user_tags' | 'dismissed_system_tags'>
): string[] {
  const userTags = normalizeSemanticTags(fragment.user_tags);
  const legacyTags = normalizeSemanticTags(fragment.tags);
  const systemTags = normalizeSemanticTags(fragment.system_tags);
  const dismissed = new Set(normalizeSemanticTags(fragment.dismissed_system_tags));
  return normalizeSemanticTags([
    ...legacyTags,
    ...userTags,
    ...systemTags.filter((tag) => !dismissed.has(tag)),
  ]);
}
