'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import { applyPollEvent, sortPolls, type Poll, type PollEvent } from '@/lib/polls/polls';

const key = (editionId: string | undefined) => ['admin', 'polls', editionId ?? 'none'] as const;

/* ------------------------------------------------------------------ demo data */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const demoPoll = (id: string, over: Partial<Poll>): Poll => ({
  id,
  editionId: 'demo-gs27',
  sessionId: null,
  question: '',
  options: [],
  status: 'draft',
  showResults: true,
  counts: null,
  total: 0,
  myVote: null,
  openedAt: null,
  closedAt: null,
  ...over,
});
let demoPolls: Poll[] = sortPolls([
  demoPoll('p-open', {
    question: 'Which barrier holds women-led businesses back most?',
    options: ['Access to credit', 'Childcare', 'Land and property rights', 'Networks and mentors'],
    status: 'open',
    counts: [48, 21, 17, 9],
    total: 95,
    openedAt: minutesAgo(2.2),
    sessionId: 'd1',
  }),
  demoPoll('p-draft-1', { question: 'Should GS-28 add a track on climate and gender?', options: ['Yes', 'No', 'Not sure'], counts: [0, 0, 0] }),
  demoPoll('p-draft-2', {
    question: 'How many women-led SMEs in Nigeria have a bank loan? Take a guess.',
    options: ['Under 5%', '5–15%', '15–30%', 'Over 30%'],
    showResults: false,
    counts: [0, 0, 0, 0],
  }),
  demoPoll('p-closed', {
    question: 'How did you hear about the summit?',
    options: ['Social media', 'A colleague', 'Email', 'Press'],
    status: 'closed',
    counts: [112, 64, 40, 9],
    total: 225,
    openedAt: minutesAgo(90),
    closedAt: minutesAgo(84),
  }),
]);
const demoSet = (next: Poll[]) => (demoPolls = sortPolls(next));

/* ---------------------------------------------------------------------- hooks */

/**
 * Every poll of the edition, kept current over the socket (opened, closed, live results). A poll
 * that hides its results sends no live tally at all, so while one is open the list is re-fetched
 * every 3 s instead: operators still see the count climb.
 */
export function usePolls(editionId: string | undefined) {
  const client = useQueryClient();
  const socket = useRealtimeSocket();

  const query = useQuery({
    queryKey: key(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoPolls) : api.get<Poll[]>('/polls', { editionId }, signal).then(sortPolls)),
    enabled: !!editionId,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'open' && !p.showResults) && !DEMO_MODE ? 3_000 : false),
  });

  useEffect(() => {
    if (!editionId) return;
    const apply = (event: PollEvent) => client.setQueryData<Poll[]>(key(editionId), (was) => (was ? applyPollEvent(was, event) : was));

    if (DEMO_MODE) {
      // The room voting on the open poll.
      const timer = setInterval(() => {
        const open = demoPolls.find((p) => p.status === 'open');
        if (!open?.counts) return;
        const counts = open.counts.map((c, i) => c + (Math.random() < 0.6 - i * 0.12 ? 1 : 0));
        const total = counts.reduce((a, b) => a + b, 0);
        demoSet(demoPolls.map((p) => (p.id === open.id ? { ...p, counts, total } : p)));
        apply({ type: 'poll:results', payload: { id: open.id, counts, total } });
      }, 1500);
      return () => clearInterval(timer);
    }

    if (!socket) return;
    const handlers: Record<string, (payload: never) => void> = {
      'poll:opened': (payload: Poll) => payload.editionId === editionId && apply({ type: 'poll:opened', payload }),
      'poll:closed': (payload: Poll) => apply({ type: 'poll:closed', payload }),
      'poll:results': (payload: { id: string; counts: number[]; total: number }) => apply({ type: 'poll:results', payload }),
    };
    const join = () => {
      socket.emit('polls:join');
      void client.invalidateQueries({ queryKey: key(editionId) }); // catch up on anything missed
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn as (payload: unknown) => void);
    socket.on('connect', join);
    if (socket.connected) socket.emit('polls:join');
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn as (payload: unknown) => void);
      socket.off('connect', join);
      socket.emit('polls:leave');
    };
  }, [editionId, socket, client]);

  return query;
}

export type PollBody = { question: string; options: string[]; showResults: boolean; sessionId: string | null };

/** Drafting, opening, closing and deleting. Each refreshes the list (opening one closes another). */
export function usePollActions(editionId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: key(editionId) });
  const demoOne = (id: string) => demoPolls.find((p) => p.id === id)!;

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: PollBody }): Promise<Poll> => {
      const payload = { ...body, sessionId: body.sessionId ?? undefined };
      if (!DEMO_MODE) return id ? api.patch<Poll>(`/polls/${id}`, payload) : api.post<Poll>('/polls', { ...payload, editionId });
      const poll: Poll = id
        ? { ...demoOne(id), ...body, counts: body.options.map(() => 0) }
        : demoPoll(`p-${Date.now()}`, { ...body, counts: body.options.map(() => 0), editionId: editionId ?? null });
      demoSet(id ? demoPolls.map((p) => (p.id === id ? poll : p)) : [...demoPolls, poll]);
      return Promise.resolve(poll);
    },
    onSuccess: refresh,
  });

  const open = useMutation({
    mutationFn: ({ id }: { id: string }): Promise<Poll> => {
      if (!DEMO_MODE) return api.post<Poll>(`/polls/${id}/open`);
      const now = new Date().toISOString();
      demoSet(
        demoPolls.map((p) =>
          p.id === id
            ? { ...p, status: 'open', openedAt: now, closedAt: null, counts: p.counts ?? p.options.map(() => 0) }
            : p.status === 'open'
              ? { ...p, status: 'closed', closedAt: now }
              : p,
        ),
      );
      return Promise.resolve(demoOne(id));
    },
    onSuccess: refresh,
  });

  const close = useMutation({
    mutationFn: ({ id }: { id: string }): Promise<Poll> => {
      if (!DEMO_MODE) return api.post<Poll>(`/polls/${id}/close`);
      demoSet(demoPolls.map((p) => (p.id === id ? { ...p, status: 'closed', closedAt: new Date().toISOString() } : p)));
      return Promise.resolve(demoOne(id));
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!DEMO_MODE) return api.delete<void>(`/polls/${id}`);
      demoSet(demoPolls.filter((p) => p.id !== id));
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  return { save, open, close, remove };
}
