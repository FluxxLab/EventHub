'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import { EMPTY_DISTRIBUTION, OPTIONS, players, sortTrivia, withLive, type Distribution, type TriviaForm, type TriviaOption, type TriviaQuestion, type TriviaStats } from '@/lib/trivia/trivia';

const LIST = ['admin', 'trivia'] as const;
/** One event's questions. */
const listKey = (editionId: string | undefined) => [...LIST, 'list', editionId ?? 'none'] as const;
const STATS = (id: string) => ['admin', 'trivia', 'stats', id] as const;

/* ------------------------------------------------------------------ demo data */

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
let demoQuestions: TriviaQuestion[] = sortTrivia([
  {
    id: 'tq-live',
    text: 'Roughly what share of Nigerian women own a bank account?',
    optionA: 'About 1 in 10',
    optionB: 'About 1 in 3',
    optionC: 'About half',
    optionD: 'About 3 in 4',
    correctOption: 'B',
    explanation: 'Around a third, against about half of men: the gap the summit set out to close.',
    status: 'live',
    createdAt: ago(30),
  },
  {
    id: 'tq-draft',
    text: 'Which country passed Africa’s first law on violence against women in public transport?',
    optionA: 'Kenya',
    optionB: 'Rwanda',
    optionC: 'Morocco',
    optionD: 'Ghana',
    correctOption: 'C',
    explanation: '',
    status: 'draft',
    createdAt: ago(20),
  },
  {
    id: 'tq-closed',
    text: 'In what year was the Maputo Protocol adopted?',
    optionA: '1995',
    optionB: '2003',
    optionC: '2010',
    optionD: '2015',
    correctOption: 'B',
    explanation: 'Adopted by the African Union in Maputo in July 2003.',
    status: 'closed',
    createdAt: ago(90),
  },
]);
const demoStats: Record<string, Distribution> = { 'tq-live': { A: 12, B: 41, C: 20, D: 6 }, 'tq-closed': { A: 18, B: 97, C: 31, D: 9 } };
const demoSet = (next: TriviaQuestion[]) => (demoQuestions = sortTrivia(next));

/* ---------------------------------------------------------------------- hooks */

/**
 * Every question with its answer counts, kept current over the socket: the live question's
 * distribution as people answer, questions going live, closing and being deleted.
 */
export function useTrivia(editionId: string | undefined) {
  const client = useQueryClient();
  const socket = useRealtimeSocket();
  const key = useMemo(() => listKey(editionId), [editionId]);

  const list = useQuery({
    queryKey: key,
    enabled: DEMO_MODE || Boolean(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoQuestions) : api.get<TriviaQuestion[]>('/trivia', { editionId }, signal).then(sortTrivia)),
  });

  // Counts for every question that has been played; drafts have none.
  const played = (list.data ?? []).filter((q) => q.status !== 'draft');
  const stats = useQueries({
    queries: played.map((q) => ({
      queryKey: STATS(q.id),
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<TriviaStats> => {
        if (DEMO_MODE) {
          const distribution = demoStats[q.id] ?? { ...EMPTY_DISTRIBUTION };
          return Promise.resolve({ questionId: q.id, playCount: players(distribution), distribution });
        }
        return api.get<TriviaStats>(`/trivia/${q.id}/stats`, undefined, signal);
      },
    })),
  });
  const statsFor = (id: string) => stats[played.findIndex((q) => q.id === id)]?.data ?? null;

  useEffect(() => {
    const setDistribution = (questionId: string, distribution: Distribution) =>
      client.setQueryData<TriviaStats>(STATS(questionId), { questionId, playCount: players(distribution), distribution });
    const refresh = () => void client.invalidateQueries({ queryKey: key, exact: true });

    if (DEMO_MODE) {
      const timer = setInterval(() => {
        const live = demoQuestions.find((q) => q.status === 'live');
        if (!live) return;
        const d = { ...(demoStats[live.id] ?? EMPTY_DISTRIBUTION) };
        const weights: Record<TriviaOption, number> = { A: 0.15, B: 0.5, C: 0.25, D: 0.1 };
        let r = Math.random();
        const pick = OPTIONS.find((o) => (r -= weights[o]) < 0) ?? 'D';
        d[pick] += 1;
        demoStats[live.id] = d;
        setDistribution(live.id, d);
      }, 1300);
      return () => clearInterval(timer);
    }

    if (!socket) return;
    const handlers: Record<string, (payload: never) => void> = {
      'trivia:question': (payload: { id: string }) => {
        // another event's question going live leaves this event's alone
        client.setQueryData<TriviaQuestion[]>(key, (was) => (was?.some((q) => q.id === payload.id) ? withLive(was, payload.id) : was));
        refresh();
      },
      'trivia:distribution': (payload: { questionId: string; distribution: Distribution }) => setDistribution(payload.questionId, payload.distribution),
      'trivia:closed': (payload: { questionId: string; distribution: Distribution }) => {
        setDistribution(payload.questionId, payload.distribution);
        client.setQueryData<TriviaQuestion[]>(key, (was) => (was ? sortTrivia(was.map((q) => (q.id === payload.questionId ? { ...q, status: 'closed' } : q))) : was));
      },
      'trivia:deleted': refresh,
    };
    const join = () => {
      socket.emit('trivia:join');
      refresh();
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn as (payload: unknown) => void);
    socket.on('connect', join);
    if (socket.connected) socket.emit('trivia:join');
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn as (payload: unknown) => void);
      socket.off('connect', join);
      socket.emit('trivia:leave');
    };
  }, [socket, client, key]);

  return { list, statsFor };
}

/** Writing, starting, stopping and deleting questions (organisers only, as the API requires). */
export function useTriviaActions(editionId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ['admin', 'trivia'] });
  const demo = <T,>(change: (qs: TriviaQuestion[]) => TriviaQuestion[], value: T) => {
    demoSet(change(demoQuestions));
    return Promise.resolve(value);
  };

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TriviaForm }): Promise<TriviaQuestion> => {
      // a new question belongs to the event on screen; an edit never moves it
      const payload = { ...body, explanation: body.explanation.trim() || undefined, ...(id ? {} : { editionId }) };
      if (!DEMO_MODE) return id ? api.patch<TriviaQuestion>(`/trivia/${id}`, payload) : api.post<TriviaQuestion>('/trivia', payload);
      const saved: TriviaQuestion = id
        ? { ...demoQuestions.find((q) => q.id === id)!, ...body }
        : { id: `tq-${Date.now()}`, ...body, status: 'draft', createdAt: new Date().toISOString() };
      return demo((qs) => (id ? qs.map((q) => (q.id === id ? saved : q)) : [...qs, saved]), saved);
    },
    onSuccess: refresh,
  });

  const start = useMutation({
    mutationFn: ({ id }: { id: string }) => (DEMO_MODE ? demo((qs) => withLive(qs, id), undefined) : api.patch(`/trivia/${id}/live`)),
    onSuccess: refresh,
  });

  const stop = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      DEMO_MODE ? demo((qs) => qs.map((q) => (q.id === id ? { ...q, status: 'closed' as const } : q)), undefined) : api.patch(`/trivia/${id}/close`),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => (DEMO_MODE ? demo((qs) => qs.filter((q) => q.id !== id), undefined) : api.delete(`/trivia/${id}`)),
    onSuccess: refresh,
  });

  return { save, start, stop, remove };
}
