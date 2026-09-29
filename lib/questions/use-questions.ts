'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import { applyQuestionEvent, rankQuestions, withStatus, type Question, type QuestionEvent, type QuestionStatus } from '@/lib/questions/questions';

const key = (sessionId: string | undefined) => ['admin', 'questions', sessionId ?? 'none'] as const;

/* ------------------------------------------------------------------ demo data */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const PEOPLE = [
  { id: 'p1', name: 'Ngozi Eze', organisation: 'UN Women Nigeria' },
  { id: 'p2', name: 'Ibrahim Musa', organisation: 'Kano State Ministry of Women Affairs' },
  { id: 'p3', name: 'Chioma Okafor', organisation: null },
  { id: 'p4', name: 'Samuel Adeyemi', organisation: 'Lagos Business School' },
  { id: 'p5', name: 'Hauwa Bello', organisation: 'Women in Tech Africa' },
];
const DEMO_TEXTS = [
  'How will the fund reach women-led businesses outside Lagos and Abuja?',
  'What data do you have on how many women were left out of the NIN rollout?',
  'Can the panel say more about childcare as economic infrastructure?',
  'How do we hold state governments to the commitments made today?',
  'Is there a plan for women with disabilities in the digital ID programme?',
  'What role should banks play, beyond lending targets?',
  'Will the slides be shared after the session?',
];
const demoQuestion = (sessionId: string, i: number, over: Partial<Question> = {}): Question => ({
  id: `${sessionId}-q${i}`,
  sessionId,
  text: DEMO_TEXTS[i % DEMO_TEXTS.length]!,
  status: 'open',
  upvotes: [14, 9, 9, 4, 2, 1, 0][i % 7]!,
  createdAt: minutesAgo(20 - i * 2),
  answeredAt: null,
  author: PEOPLE[i % PEOPLE.length]!,
  mine: false,
  upvoted: false,
  ...over,
});
const demoStore = new Map<string, Question[]>();
function demoQuestions(sessionId: string): Question[] {
  if (!demoStore.has(sessionId)) {
    demoStore.set(
      sessionId,
      rankQuestions([
        ...[0, 1, 2, 3, 4].map((i) => demoQuestion(sessionId, i)),
        demoQuestion(sessionId, 5, { status: 'answered', answeredAt: minutesAgo(3), upvotes: 11 }),
        demoQuestion(sessionId, 6, { status: 'dismissed' }),
      ]),
    );
  }
  return demoStore.get(sessionId)!;
}

/* ---------------------------------------------------------------------- hooks */

/**
 * A session's questions, dismissed ones included (moderators see everything), kept current over
 * the socket: new questions, votes, status changes and deletions from any console or phone land
 * in the cache, ranked as the API ranks them. Joins only the session's questions room, which does
 * not count this console as a viewer.
 */
export function useQuestions(sessionId: string | undefined) {
  const client = useQueryClient();
  const socket = useRealtimeSocket();

  const query = useQuery({
    queryKey: key(sessionId),
    queryFn: ({ signal }) =>
      DEMO_MODE
        ? Promise.resolve(demoQuestions(sessionId!))
        : api.get<Question[]>(`/sessions/${sessionId}/questions`, { all: true }, signal).then(rankQuestions),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (!sessionId) return;
    const apply = (event: QuestionEvent) =>
      client.setQueryData<Question[]>(key(sessionId), (was) => (was ? applyQuestionEvent(was, event) : was));

    if (DEMO_MODE) {
      // A lively room: votes trickle in, and now and then a new question.
      let n = 100;
      const timer = setInterval(() => {
        const list = client.getQueryData<Question[]>(key(sessionId)) ?? [];
        const open = list.filter((q) => q.status === 'open');
        if (Math.random() < 0.3) {
          n += 1;
          apply({ type: 'question:new', payload: demoQuestion(sessionId, n, { id: `${sessionId}-q${n}`, createdAt: new Date().toISOString(), upvotes: 0 }) });
        } else if (open.length) {
          const pick = open[Math.floor(Math.random() * open.length)]!;
          apply({ type: 'question:votes', payload: { id: pick.id, upvotes: pick.upvotes + 1 } });
        }
      }, 4000);
      return () => clearInterval(timer);
    }

    if (!socket) return;
    const handlers = {
      'question:new': (payload: Question) => payload.sessionId === sessionId && apply({ type: 'question:new', payload }),
      'question:votes': (payload: { id: string; upvotes: number }) => apply({ type: 'question:votes', payload }),
      'question:status': (payload: { id: string; status: QuestionStatus; answeredAt: string | null }) => apply({ type: 'question:status', payload }),
      'question:deleted': (payload: { id: string }) => apply({ type: 'question:deleted', payload }),
    };
    const join = () => {
      socket.emit('questions:join', sessionId);
      // Anything missed while disconnected comes back with a fresh list.
      void client.invalidateQueries({ queryKey: key(sessionId) });
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn as (payload: unknown) => void);
    socket.on('connect', join);
    if (socket.connected) socket.emit('questions:join', sessionId);
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn as (payload: unknown) => void);
      socket.off('connect', join);
      socket.emit('questions:leave', sessionId);
    };
  }, [sessionId, socket, client]);

  return query;
}

/**
 * Moderator actions. Both show at once (the queue moves the moment the moderator taps) and put
 * the queue back if the API refuses.
 */
export function useQuestionActions(sessionId: string | undefined) {
  const client = useQueryClient();
  const optimistic = async (change: (list: Question[]) => Question[]) => {
    await client.cancelQueries({ queryKey: key(sessionId) });
    const before = client.getQueryData<Question[]>(key(sessionId));
    if (before) client.setQueryData(key(sessionId), change(before));
    return { before };
  };
  const rollback = (_error: Error, _vars: unknown, context: { before?: Question[] } | undefined) => {
    if (context?.before) client.setQueryData(key(sessionId), context.before);
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuestionStatus }) =>
      DEMO_MODE ? Promise.resolve() : api.patch<Question>(`/questions/${id}/status`, { status }).then(() => undefined),
    onMutate: ({ id, status }) => optimistic((list) => withStatus(list, id, status)),
    onError: rollback,
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => (DEMO_MODE ? Promise.resolve() : api.delete<void>(`/questions/${id}`)),
    onMutate: ({ id }) => optimistic((list) => list.filter((q) => q.id !== id)),
    onError: rollback,
  });

  return { setStatus, remove };
}
