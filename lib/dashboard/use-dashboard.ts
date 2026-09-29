'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_DASHBOARD } from '@/lib/dashboard/demo';
import type { DashboardView } from '@/lib/dashboard/types';
import { DEMO_MODE } from '@/lib/demo';

/**
 * The dashboard, refreshed every 30 s while the tab is open (the API caches it for the same
 * window, so a room full of open consoles costs one aggregation, not one each).
 */
export function useDashboard(editionId?: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'dashboard', editionId ?? 'current'],
    queryFn: ({ signal }) =>
      DEMO_MODE
        ? Promise.resolve(DEMO_DASHBOARD)
        : api.get<DashboardView>('/admin/dashboard', { editionId }, signal),
    refetchInterval: 30_000,
    enabled,
  });
}
