'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AnalyticsSummary } from '@/lib/analytics/analytics';
import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';

/** Days from..to at the venue, as the API names them. */
function venueDays(from: string, to: string): string[] {
  const out: string[] = [];
  const day = (t: number) => new Date(t + 3_600_000).toISOString().slice(0, 10);
  for (let t = Date.parse(from); t < Date.parse(to); t += 86_400_000) if (out.at(-1) !== day(t)) out.push(day(t));
  return out;
}

/** A plausible summit week: quiet, then two busy days, then a tail. */
function demoSummary(from: string, to: string): AnalyticsSummary {
  const days = venueDays(from, to);
  const shape = days.map((_, i) => {
    const mid = (days.length - 1) / 2;
    return Math.max(0, Math.round(560 * Math.exp(-((i - mid) ** 2) / Math.max(1, days.length / 3)) - 20 + ((i * 37) % 23)));
  });
  const total = shape.reduce((a, b) => a + b, 0);
  const scale = total / 1000;
  return {
    from,
    to,
    totalEvents: Math.round(total * 38),
    activeDelegates: days.map((day, i) => ({ day, count: shape[i]! })),
    screens: [
      { path: '/', views: 4200 },
      { path: '/agenda', views: 3900 },
      { path: '/sessions/6f1c0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21', views: 1400 },
      { path: '/sessions/77ab0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21', views: 1350 },
      { path: '/my-pass', views: 2100 },
      { path: '/live/hall-a', views: 1800 },
      { path: '/speakers', views: 1150 },
      { path: '/networking', views: 980 },
      { path: '/passport', views: 870 },
      { path: '/materials', views: 640 },
      { path: '/certificate', views: 410 },
      { path: '/help', views: 220 },
    ].map((s) => ({ ...s, views: Math.round(s.views * scale) })),
    features: [
      { feature: 'session_bookmark', uses: 2300 },
      { feature: 'question_asked', uses: 1450 },
      { feature: 'poll_vote', uses: 3100 },
      { feature: 'captions_opened', uses: 1250 },
      { feature: 'passport_stamp', uses: 1900 },
      { feature: 'connection_request', uses: 760 },
      { feature: 'certificate_download', uses: 380 },
      { feature: 'material_download', uses: 520 },
    ]
      .map((f) => ({ ...f, uses: Math.round(f.uses * scale) }))
      .sort((a, b) => b.uses - a.uses),
    platforms: { android: Math.round(total * 27), ios: Math.round(total * 9), web: Math.round(total * 2) },
  };
}

/** App usage for a period. The previous period's numbers stay on screen while a new one loads. */
export function useAnalyticsSummary(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['admin', 'analytics', range?.from, range?.to],
    enabled: range !== null,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve(demoSummary(range!.from, range!.to)) : api.get<AnalyticsSummary>('/analytics/summary', { from: range!.from, to: range!.to }, signal),
  });
}
