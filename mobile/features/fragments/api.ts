import { API_ENDPOINTS } from '@/constants/config';
import {
  buildMultipartFilePart,
  prepareManagedImageFile,
} from '@/features/core/files/runtime';
import { get, sendForm } from '@/features/core/api/client';
import type {
  Fragment,
  FragmentListResponse,
  FragmentVisualizationResponse,
  MediaAsset,
} from '@/types/fragment';

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

export async function uploadImageAsset(uri: string, fileName: string, mimeType: string): Promise<MediaAsset> {
  /*上传图片素材后返回带访问地址的统一媒体资源。 */
  const managedFile = await prepareManagedImageFile(uri, fileName, mimeType);
  const formData = new FormData();
  formData.append('file', buildMultipartFilePart(managedFile) as never);
  formData.append('media_kind', 'image');
  return sendForm<MediaAsset>(API_ENDPOINTS.MEDIA_ASSETS, 'POST', formData);
}
