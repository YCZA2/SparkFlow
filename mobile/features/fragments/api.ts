import { API_ENDPOINTS } from '@/constants/config';
import { del, get, patch, post } from '@/features/core/api/client';
import type {
  CreateFragmentRequest,
  Fragment,
  FragmentListResponse,
  FragmentVisualizationResponse,
} from '@/types/fragment';

export interface UpdateFragmentRequest {
  folder_id?: string | null;
  body_markdown?: string;
}

export async function fetchFragments(folderId?: string): Promise<FragmentListResponse> {
  const url = folderId
    ? `${API_ENDPOINTS.FRAGMENTS.LIST}?folder_id=${encodeURIComponent(folderId)}`
    : API_ENDPOINTS.FRAGMENTS.LIST;
  return get<FragmentListResponse>(url);
}

export async function fetchFragmentDetail(id: string): Promise<Fragment> {
  return get<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

export async function fetchFragmentVisualization(): Promise<FragmentVisualizationResponse> {
  return get<FragmentVisualizationResponse>(API_ENDPOINTS.FRAGMENTS.VISUALIZATION);
}

export async function deleteFragment(id: string): Promise<void> {
  await del<void>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

export async function createFragment(data: CreateFragmentRequest, folderId?: string): Promise<Fragment> {
  // 如果传入了 folderId，合并到请求数据中
  const requestData = folderId ? { ...data, folder_id: folderId } : data;
  const endpoint = data.body_markdown ? API_ENDPOINTS.FRAGMENTS.CONTENT : API_ENDPOINTS.FRAGMENTS.LIST;
  return post<Fragment>(endpoint, requestData);
}

export async function updateFragment(id: string, data: UpdateFragmentRequest): Promise<Fragment> {
  return patch<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id), data);
}
