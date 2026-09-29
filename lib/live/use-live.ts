'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { useRealtimeEvents, useRealtimeStatus } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import type { BoardSession, BroadcastFlags, LiveSession } from '@/lib/live/live';

const BOARD = ['live', 'board'] as const;
const OVERVIEW = ['live', 'overview'] as const;

/* Demo: a Day 1 morning with the opening plenary on air. */
const today = (hm: string) => {
  const d = new Date();
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h!, m!, 0, 0);
  return d.toISOString();
};
let demoBoard: BoardSession[] = [
  ['d1', 'Opening plenary: inclusion that scales', 'Main Hall', '09:00', '10:00', 'live'],
  ['d2', 'Keynote: the cost of exclusion', 'Main Hall', '10:30', '11:15', 'scheduled'],
  ['d3', 'Digital IDs and the last mile', 'Hall A', '10:30', '11:45', 'live'],
  ['d4', 'Women in trade finance', 'Hall B', '10:30', '12:00', 'scheduled'],
  ['d5', 'Safe transport after dark', 'Hall B', '13:00', '14:00', 'scheduled'],
  ['d6', 'Welcome coffee', 'Garden Terrace', '08:00', '09:00', 'completed'],
].map(([id, title, room, start, end, status]) => ({
  id: id!,
  title: title!,
  day: 1,
  startsAt: today(start!),
  endsAt: today(end!),
  room: room!,
  track: 'general',
  type: 'panel',
  status: status as BoardSession['status'],
  speakers: [{ id: 'sp', name: 'Amina Yusuf', role: 'Director', organisation: 'PIC' }],
}));
const demoFlags = new Map<string, BroadcastFlags>();
const flagsOf = (id: string) => demoFlags.get(id) ?? { cutToBreak: false, captionsOverlay: true, signLanguageOverlay: false };

/**
 * Every session of the current edition. Changes arrive instantly over the live connection (see
 * `useLiveRealtime`); polling is only the safety net, slower while that connection is up.
 */
export function useBoard() {
  const connection = useRealtimeStatus();
  return useQuery({
    queryKey: BOARD,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoBoard) : api.get<BoardSession[]>('/sessions/board', undefined, signal)),
    refetchInterval: connection === 'live' ? 60_000 : 15_000,
  });
}

/** Session events that change the board: any of them refreshes it (and the live view). */
const SESSION_EVENTS = ['session:status', 'session:created', 'session:updated', 'session:deleted', 'sessions:shifted'] as const;

/**
 * Listens for session changes made anywhere (another console, the API) and refreshes the board
 * and the live overview at once, instead of waiting for the next poll.
 */
export function useLiveRealtime() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: BOARD });
    void client.invalidateQueries({ queryKey: OVERVIEW });
  };
  useRealtimeEvents(Object.fromEntries(SESSION_EVENTS.map((event) => [event, refresh])));
}

/** Live sessions with viewers, caption listeners, feed state and flags; polled every 5 s while the tab is visible. */
export function useLiveOverview(enabled: boolean) {
  return useQuery({
    queryKey: OVERVIEW,
    queryFn: async ({ signal }) => {
      if (!DEMO_MODE) return (await api.get<{ sessions: LiveSession[] }>('/live-ops/overview', undefined, signal)).sessions;
      return demoBoard
        .filter((s) => s.status === 'live')
        .map((s, i) => ({ id: s.id, title: s.title, room: s.room, viewers: 240 - i * 90 + Math.round(Math.random() * 12), captionListeners: 40 - i * 15, capturing: i === 0, flags: flagsOf(s.id) }));
    },
    refetchInterval: 5_000,
    enabled,
  });
}

/** Start or end sessions, and flip a live session's broadcast flags. Each refreshes both views. */
export function useLiveActions() {
  const client = useQueryClient();
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: BOARD }), client.invalidateQueries({ queryKey: OVERVIEW })]);
  const setDemoStatus = (id: string, status: BoardSession['status']) => {
    demoBoard = demoBoard.map((s) => (s.id === id ? { ...s, status } : s));
  };

  /**
   * Ends `endId` (if given) and then starts `startId`. The API does not end the previous session
   * itself, so "start next" does both, in that order, to keep one session live per room.
   */
  const switchSession = useMutation({
    mutationFn: async ({ endId, startId }: { endId?: string; startId?: string }) => {
      if (endId) {
        if (DEMO_MODE) setDemoStatus(endId, 'completed');
        else await api.patch(`/sessions/${endId}/status`, { status: 'completed' });
      }
      if (startId) {
        if (DEMO_MODE) setDemoStatus(startId, 'live');
        else await api.patch(`/sessions/${startId}/status`, { status: 'live' });
      }
    },
    onSettled: refresh,
  });

  const setBreak = useMutation({
    mutationFn: ({ sessionId, active }: { sessionId: string; active: boolean }) => {
      if (!DEMO_MODE) return api.post<BroadcastFlags>('/live-ops/cut-to-break', { sessionId, active });
      demoFlags.set(sessionId, { ...flagsOf(sessionId), cutToBreak: active });
      return Promise.resolve(flagsOf(sessionId));
    },
    onSettled: refresh,
  });

  const setOverlays = useMutation({
    mutationFn: ({ sessionId, ...change }: { sessionId: string; captions?: boolean; signLanguage?: boolean }) => {
      if (!DEMO_MODE) return api.post<BroadcastFlags>('/live-ops/set-overlays', { sessionId, ...change });
      const was = flagsOf(sessionId);
      demoFlags.set(sessionId, { ...was, captionsOverlay: change.captions ?? was.captionsOverlay, signLanguageOverlay: change.signLanguage ?? was.signLanguageOverlay });
      return Promise.resolve(flagsOf(sessionId));
    },
    onSettled: refresh,
  });

  return { switchSession, setBreak, setOverlays };
}
