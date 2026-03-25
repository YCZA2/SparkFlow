import { useCallback, useRef } from 'react';
import { type Href, useRouter } from 'expo-router';

import {
  createNavigationAttemptRecord,
  type NavigationAttemptRecord,
  shouldBlockNavigationAttempt,
} from '@/utils/navigationDedup';

export function useSingleFlightRouterPush(cooldownMs = 600) {
  /*把 router.push 包装成短时去重版本，避免快速连点把同一详情页压栈两次。 */
  const router = useRouter();
  const lastAttemptRef = useRef<NavigationAttemptRecord | null>(null);

  return useCallback(
    (href: Href, key: string) => {
      /*同一路由命中冷却窗时直接忽略，其他目标仍可立即跳转。 */
      const now = Date.now();
      if (shouldBlockNavigationAttempt(lastAttemptRef.current, key, now, cooldownMs)) {
        return false;
      }

      lastAttemptRef.current = createNavigationAttemptRecord(key, now);
      router.push(href);
      return true;
    },
    [cooldownMs, router]
  );
}
