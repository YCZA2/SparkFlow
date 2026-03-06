import { API_ENDPOINTS } from '@/constants/config';
import { del, get, patch, post } from '@/features/core/api/client';
import type { CreateFragmentRequest, Fragment, FragmentListResponse } from '@/types/fragment';

export interface UpdateFragmentRequest {
  transcript?: string;
  summary?: string;
  tags?: string[];
}

export async function fetchFragments(): Promise<FragmentListResponse> {
  return get<FragmentListResponse>(API_ENDPOINTS.FRAGMENTS.LIST);
}

export async function fetchFragmentDetail(id: string): Promise<Fragment> {
  return get<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

export async function deleteFragment(id: string): Promise<void> {
  await del<void>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

export async function createFragment(data: CreateFragmentRequest): Promise<Fragment> {
  return post<Fragment>(API_ENDPOINTS.FRAGMENTS.LIST, data);
}

export async function updateFragment(id: string, data: UpdateFragmentRequest): Promise<Fragment> {
  return patch<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id), data);
}
