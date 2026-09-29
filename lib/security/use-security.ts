'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { SecurityEvent, Severity } from '@/lib/security/security';

export const PAGE = 50;

export type EventFilters = { severity?: Severity; types?: readonly string[]; actorId?: string; from?: string };

const AMINA = { id: 'a1', name: 'Amina Yusuf', email: 'amina@pic.org.ng', tier: 'admin' };
const TUNDE = { id: 'a2', name: 'Tunde Bakare', email: 'tunde@pic.org.ng', tier: 'session_admin' };
const NGOZI = { id: 'd1', name: 'Ngozi Eze', email: 'ngozi.eze@gmail.com', tier: 'standard' };
const KEMI = { id: 'd2', name: 'Kemi Adeyemi', email: 'kemi@techher.ng', tier: 'vip' };

type Actor = SecurityEvent['actor'];
const demoRows: [minutesAgo: number, type: string, severity: Severity, description: string, actor: Actor | 'deleted', metadata: SecurityEvent['metadata']][] = [
  [3, 'refresh_token_reuse', 'critical', 'Refresh token reuse detected - all tokens for user revoked', KEMI, null],
  [9, 'pass_verification_failed', 'warning', 'Invalid or expired QR pass presented at a gate', null, null],
  [14, 'session_deleted', 'warning', 'Session deleted', AMINA, { params: { id: '6f1c0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21' }, body: {} }],
  [22, 'delegate_reported', 'warning', 'Delegate reported for harassment', NGOZI, { reportedId: '77ab0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21', reason: 'harassment', details: 'Repeated messages after I said no.' }],
  [31, 'comment_hidden', 'info', 'Discussion comment hidden', AMINA, { params: { id: 'c-8812' }, body: {} }],
  [48, 'tier_changed', 'warning', 'Delegate access tier changed', AMINA, { params: { id: 'd2' }, body: { tier: 'vip' } }],
  [66, 'session_status_changed', 'info', 'Session status changed', TUNDE, { params: { id: 's-hall-a-2' }, body: { status: 'live' } }],
  [90, 'delegates_exported', 'warning', 'Delegate list exported', AMINA, { params: {}, body: {} }],
  [130, 'captions_cleared', 'info', 'Captions cleared for a room', TUNDE, { params: { room: 'Hall A' }, body: {} }],
  [190, 'password_changed', 'info', 'Password changed; every other session signed out', NGOZI, null],
  [260, 'delegate_registered', 'info', 'Registration matched list entry — tier vip granted', KEMI, { matched: true, tier: 'vip', verifiedVia: 'email' }],
  [340, 'certificate_design_saved', 'info', 'Certificate design saved', AMINA, { params: { id: 'demo-gs27' }, body: { contentType: 'image/png', width: 3508, height: 2480 } }],
  [500, 'delegate_deleted_account', 'warning', 'Delegate deleted their account', 'deleted', null],
  [720, 'staff_account_created', 'critical', 'Staff account created', AMINA, { body: { email: 'tunde@pic.org.ng', tier: 'session_admin' } }],
  [1500, 'pitch_voting_opened', 'info', 'Pitch voting opened', AMINA, { params: { id: 't-safety' } }],
  [2900, 'google_linked', 'info', 'Google sign-in linked to an existing account', NGOZI, null],
];

function demoEvents(filters: EventFilters, before?: string): SecurityEvent[] {
  const now = Date.now();
  return demoRows
    .map(([ago, type, severity, description, actor, metadata], i) => ({
      id: `demo-${i}`,
      type,
      severity,
      description,
      actionId: actor === 'deleted' ? 'gone-1' : (actor?.id ?? null),
      actor: actor === 'deleted' ? null : actor,
      metadata,
      createdAt: new Date(now - ago * 60_000).toISOString(),
    }))
    .filter(
      (e) =>
        (!filters.severity || e.severity === filters.severity) &&
        (!filters.types || filters.types.includes(e.type)) &&
        (!filters.actorId || e.actionId === filters.actorId) &&
        (!filters.from || e.createdAt >= filters.from) &&
        (!before || e.createdAt < before),
    );
}

/** The log, newest first; `fetchNextPage` loads the next 50 older events. Refreshes every minute. */
export function useSecurityEvents(filters: EventFilters) {
  return useInfiniteQuery({
    queryKey: ['admin', 'security', filters],
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: ({ pageParam, signal }) =>
      DEMO_MODE
        ? Promise.resolve(demoEvents(filters, pageParam))
        : api.get<SecurityEvent[]>(
            '/security/events',
            {
              severity: filters.severity,
              types: filters.types?.join(','),
              actorId: filters.actorId,
              from: filters.from,
              before: pageParam,
              limit: PAGE,
            },
            signal,
          ),
    // a short page is the last one; the next page is everything older than this one's oldest
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last.at(-1)!.createdAt),
  });
}
