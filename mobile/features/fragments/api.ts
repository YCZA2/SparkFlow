import { API_ENDPOINTS } from '@/constants/config';
import { del, get, patch, post, sendForm } from '@/features/core/api/client';
import type {
  CreateFragmentRequest,
  Fragment,
  FragmentListResponse,
  FragmentVisualizationResponse,
  MediaAsset,
} from '@/types/fragment';

export interface UpdateFragmentRequest {
  folder_id?: string | null;
  body_html?: string;
  media_asset_ids?: string[];
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
  /*手动创建碎片时统一走 HTML 正文接口。 */
  const requestData = folderId ? { ...data, folder_id: folderId } : data;
  return post<Fragment>(API_ENDPOINTS.FRAGMENTS.CONTENT, requestData);
}

export async function updateFragment(id: string, data: UpdateFragmentRequest): Promise<Fragment> {
  return patch<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id), data);
}

export async function uploadImageAsset(uri: string, fileName: string, mimeType: string): Promise<MediaAsset> {
  /*上传图片素材后返回带访问地址的统一媒体资源。 */
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  } as never);
  formData.append('media_kind', 'image');
  return sendForm<MediaAsset>(API_ENDPOINTS.MEDIA_ASSETS, 'POST', formData);
}
