import { useRouter } from 'expo-router';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { useFragmentListScreenState } from './useFragmentListScreenState';

export interface FragmentsScreenState {
  fragments: ReturnType<typeof useFragmentListScreenState>['fragments'];
  sections: ReturnType<typeof useFragmentListScreenState>['sections'];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  totalLabel: string;
  selection: ReturnType<typeof useFragmentListScreenState>['selection'];
  removingFragmentIds: ReturnType<typeof useFragmentListScreenState>['removingFragmentIds'];
  openCloud: () => void;
  openRecorder: () => void;
  openTextNote: () => void;
  openNetworkSettings: () => void;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  onFragmentPress: ReturnType<typeof useFragmentListScreenState>['onFragmentPress'];
  onGenerate: () => void;
}
export function useFragmentsScreen(): FragmentsScreenState {
  /*首页碎片入口统一转发列表 view-model 和页面级导航动作。 */
  const router = useRouter();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const list = useFragmentListScreenState({ enableRefreshParam: true });

  return {
    fragments: list.fragments,
    sections: list.sections,
    isLoading: list.isLoading,
    isRefreshing: list.isRefreshing,
    error: list.error,
    totalLabel: list.totalLabel,
    selection: list.selection,
    removingFragmentIds: list.removingFragmentIds,
    openCloud: () => router.push('/fragment-cloud'),
    openRecorder: () => router.push('/record-audio'),
    openTextNote: () => router.push('/text-note'),
    openNetworkSettings: () => {
      if (developerToolsEnabled) {
        router.push('/network-settings');
      }
    },
    refresh: list.refresh,
    reload: list.reload,
    onFragmentPress: list.onFragmentPress,
    onGenerate: list.onGenerate,
  };
}
