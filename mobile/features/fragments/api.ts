import { API_ENDPOINTS } from '@/constants/config';
import { del, get, patch, post, sendForm } from '@/features/core/api/client';
import type {
  CreateFragmentRequest,
  Fragment,
  FragmentAiPatch,
  FragmentListResponse,
  FragmentVisualizationResponse,
  MediaAsset,
} from '@/types/fragment';

export interface UpdateFragmentRequest {
  folder_id?: string | null;
  body_markdown?: string;
  media_asset_ids?: string[];
}

export interface FragmentAiEditRequest {
  body_markdown: string;
  selection_text?: string;
  instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed';
}

export interface FragmentAiEditResponse {
  patch: FragmentAiPatch;
  preview_text: string;
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
  /** 中文注释：手动创建碎片时统一走 Markdown 正文接口。 */
  const requestData = folderId ? { ...data, folder_id: folderId } : data;
  return post<Fragment>(API_ENDPOINTS.FRAGMENTS.CONTENT, requestData);
}

export async function updateFragment(id: string, data: UpdateFragmentRequest): Promise<Fragment> {
  return patch<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id), data);
}

export async function requestAiEdit(id: string, data: FragmentAiEditRequest): Promise<FragmentAiEditResponse> {
  /** 中文注释：请求后端返回可直接应用到 Markdown 正文的 AI patch。 */
  return post<FragmentAiEditResponse>(API_ENDPOINTS.FRAGMENTS.AI_EDIT(id), data);
}

export async function uploadImageAsset(uri: string, fileName: string, mimeType: string): Promise<MediaAsset> {
  /** 中文注释：上传图片素材后返回带访问地址的统一媒体资源。 */
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  } as never);
  formData.append('media_kind', 'image');
  return sendForm<MediaAsset>(API_ENDPOINTS.MEDIA_ASSETS, 'POST', formData);
}
