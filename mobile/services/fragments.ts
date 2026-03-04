/**
 * 碎片笔记服务模块
 * 提供碎片列表、详情、删除等功能
 */

import { API_ENDPOINTS } from '@/constants/config';
import { get, del } from './client';
import type { Fragment, FragmentListResponse } from '@/types/fragment';

/**
 * 获取碎片列表
 * @returns 碎片列表响应，包含 items 和 total
 *
 * @example
 * ```typescript
 * const { items, total } = await fetchFragments();
 * console.log(`共有 ${total} 条碎片`);
 * ```
 */
export async function fetchFragments(): Promise<FragmentListResponse> {
  return get<FragmentListResponse>(API_ENDPOINTS.FRAGMENTS.LIST);
}

/**
 * 获取单条碎片详情
 * @param id 碎片 ID
 * @returns 碎片详情对象
 *
 * @example
 * ```typescript
 * const fragment = await fetchFragmentDetail('fragment-xxx');
 * console.log(fragment.transcript);
 * ```
 */
export async function fetchFragmentDetail(id: string): Promise<Fragment> {
  return get<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

/**
 * 删除碎片
 * @param id 碎片 ID
 * @returns 空对象（删除成功）
 *
 * @example
 * ```typescript
 * await deleteFragment('fragment-xxx');
 * ```
 */
export async function deleteFragment(id: string): Promise<void> {
  console.log('[Fragments] 删除碎片，ID:', id);
  try {
    await del<void>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
    console.log('[Fragments] 删除成功');
  } catch (err) {
    console.error('[Fragments] 删除失败:', err);
    throw err;
  }
}

/**
 * 创建碎片（手动创建，非语音）
 * @param data 碎片数据
 * @returns 创建的碎片对象
 */
export async function createFragment(data: CreateFragmentRequest): Promise<Fragment> {
  return post<Fragment>(API_ENDPOINTS.FRAGMENTS.LIST, data);
}

/**
 * 更新碎片
 * @param id 碎片 ID
 * @param data 更新数据
 * @returns 更新后的碎片对象
 */
export async function updateFragment(
  id: string,
  data: UpdateFragmentRequest
): Promise<Fragment> {
  return patch<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id), data);
}

// 导入需要的函数
import { post, patch } from './client';

/**
 * 创建碎片请求数据类型
 */
export interface CreateFragmentRequest {
  /** 转写文本 */
  transcript?: string;
  /** AI 摘要 */
  summary?: string;
  /** 标签列表 */
  tags?: string[];
  /** 来源 */
  source?: 'voice' | 'manual' | 'video_parse';
}

/**
 * 更新碎片请求数据类型
 */
export interface UpdateFragmentRequest {
  /** 转写文本 */
  transcript?: string;
  /** AI 摘要 */
  summary?: string;
  /** 标签列表 */
  tags?: string[];
}
