'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import { useOpsProblems } from '@/components/shell/ops-alerts';
import { runsEvents, type StaffTier } from '@/lib/auth/session';
import { boardKey, fetchBoard } from '@/lib/calls-to-action/use-calls-to-action';
import { DEMO_MODE } from '@/lib/demo';
import { useWorkingEdition } from '@/lib/events/working-edition';

/**
 * What the sidebar remembers per browser (the groups left open, the pages pinned to the top) and
 * what it counts (things waiting for someone). Storage can be blocked (private windows, policy):
 * then nothing is remembered and everything still works.
 */
const OPEN_KEY = 'pic.admin.sidebar-open';
const PINNED_KEY = 'pic.admin.sidebar-pinned-pages';
/** Pages that can be pinned to the top: a few, so the top stays short. */
export const MAX_PINNED = 5;
const CHANGE = 'pic:sidebar-prefs';

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
function write(key: string, values: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // not remembered this time
  }
  window.dispatchEvent(new Event(CHANGE));
}
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}
// stable snapshots: useSyncExternalStore compares by reference, so cache the parsed list per raw string
const cache = new Map<string, { raw: string | null; list: string[] }>();
function snapshot(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.list;
  const list = read(key);
  cache.set(key, { raw, list });
  return list;
}
const EMPTY: string[] = [];

/** A list remembered under `key`, and a setter. */
function useStoredList(key: string): [string[], (next: string[]) => void] {
  const list = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY,
  );
  const set = useCallback((next: string[]) => write(key, next), [key]);
  return [list, set];
}

/** The groups left open, by label. */
export const useOpenGroups = () => useStoredList(OPEN_KEY);

/** The pages pinned to the top of the sidebar, by href, in the order pinned. */
export function usePinnedPages(): { pinned: string[]; toggle: (href: string) => void } {
  const [pinned, set] = useStoredList(PINNED_KEY);
  const toggle = useCallback((href: string) => set(pinned.includes(href) ? pinned.filter((h) => h !== href) : [...pinned, href].slice(-MAX_PINNED)), [pinned, set]);
  return { pinned, toggle };
}

/**
 * Counts beside the pages where something is waiting: calls to action to review, live-room
 * problems. Only for those who can open the page.
 */
export function useSidebarCounts(tier: StaffTier): Record<string, number> {
  const organiser = runsEvents(tier);
  const { edition } = useWorkingEdition();
  const calls = useQuery({
    queryKey: boardKey(edition?.id ?? 'none'),
    queryFn: ({ signal }) => fetchBoard(edition!.id, signal),
    enabled: organiser && !!edition && !DEMO_MODE,
    staleTime: 60_000,
  });
  const problems = useOpsProblems();
  const toReview = calls.data?.items.filter((c) => c.status === 'suggested').length ?? 0;
  return { '/calls-to-action': toReview, '/live': problems.length };
}
