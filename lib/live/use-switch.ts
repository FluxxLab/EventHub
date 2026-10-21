'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { useRealtimeEvents } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';

/**
 * The AI's suggestion that a room's next session has started (`start_next`) or its live one has
 * ended (`end_current`), from what its captions say. A person switches from it, or says not yet.
 */
export type SwitchSuggestion = {
  id: string;
  room: string;
  kind: 'start_next' | 'end_current';
  fromSessionId: string;
  toSessionId: string | null;
  confidence: number;
  /** The words in the captions it rests on. */
  evidence: string;
  reason: string;
  createdAt: string;
};

/** `GET /live-ops/switch-suggestions`: whether the server has them on, the open ones, and today's tally. */
export type SwitchSuggestions = {
  enabled: boolean;
  open: SwitchSuggestion[];
  today: { right: number; wrong: number; unanswered: number };
};

const KEY = ['live', 'switch-suggestions'] as const;

let demo: SwitchSuggestions = {
  enabled: true,
  open: [
    {
      id: 'demo-switch',
      room: 'Main Hall',
      kind: 'start_next',
      fromSessionId: 'd1',
      toSessionId: 'd2',
      confidence: 0.92,
      evidence: 'Please join me in welcoming our keynote speaker to talk about the cost of exclusion',
      reason: 'The keynote speaker was introduced to begin.',
      createdAt: new Date().toISOString(),
    },
  ],
  today: { right: 4, wrong: 0, unanswered: 1 },
};

/** The open suggestions, refreshed the moment the server finds or settles one, and every 30 s besides. */
export function useSwitchSuggestions(enabled: boolean) {
  const client = useQueryClient();
  useRealtimeEvents({ 'switch:suggestions': () => void client.invalidateQueries({ queryKey: KEY }) });
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demo) : api.get<SwitchSuggestions>('/live-ops/switch-suggestions', undefined, signal)),
    refetchInterval: 30_000,
    enabled,
  });
}

/** "Switched from it" (counted right) or "not yet" (counted wrong). */
export function useSwitchDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'dismiss' }) => {
      if (!DEMO_MODE) return api.post<SwitchSuggestions>(`/live-ops/switch-suggestions/${id}/${decision}`, {});
      demo = {
        ...demo,
        open: demo.open.filter((s) => s.id !== id),
        today: decision === 'accept' ? { ...demo.today, right: demo.today.right + 1 } : { ...demo.today, wrong: demo.today.wrong + 1 },
      };
      return Promise.resolve(demo);
    },
    onSuccess: (saved) => client.setQueryData(KEY, saved),
  });
}

/** "4 of 5 right" for today's answered suggestions, or null before any is answered. */
export function switchTally(today: SwitchSuggestions['today']): string | null {
  const answered = today.right + today.wrong;
  return answered ? `${today.right} of ${answered} right` : null;
}
