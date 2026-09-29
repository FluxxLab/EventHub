'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import { applyVotingEvent, sortTopics, type PitchEntry, type PitchForm, type PitchTopic, type TopicTally, type VotingEvent } from '@/lib/pitchathon/pitchathon';

/** One event's topics. */
const topicsKey = (editionId: string | undefined) => ['admin', 'pitchathon', 'topics', editionId ?? 'none'] as const;

/* ------------------------------------------------------------------ demo data */

const pitch = (id: string, topicId: string, innovatorName: string, country: string, track: PitchEntry['track'], description: string, voteCount = 0): PitchEntry => ({
  id,
  topicId,
  innovatorName,
  country,
  track,
  description,
  voteCount,
});
let demoTopics: PitchTopic[] = [
  {
    id: 't-finance',
    name: 'Financial inclusion',
    position: 0,
    voting: 'closed',
    closedAt: new Date(Date.now() - 50 * 60_000).toISOString(),
    createdAt: '2027-09-01T09:00:00Z',
    voters: 212,
    entries: [
      pitch('e1', 't-finance', 'AjoSave', 'Nigeria', 'economic', 'A digital savings circle for market women, with credit scores built from contributions.', 118),
      pitch('e2', 't-finance', 'MamaPesa', 'Kenya', 'economic', 'Agent-banking kiosks run by women in rural counties.', 61),
      pitch('e3', 't-finance', 'TradeHer', 'Ghana', 'economic', 'Invoice financing for women-led cross-border traders.', 33),
    ],
    result: { topicId: 't-finance', counts: [{ entryId: 'e1', votes: 118 }, { entryId: 'e2', votes: 61 }, { entryId: 'e3', votes: 33 }], voters: 212 },
  },
  {
    id: 't-safety',
    name: 'Safety and mobility',
    position: 1,
    voting: 'open',
    closedAt: null,
    createdAt: '2027-09-01T09:01:00Z',
    voters: 97,
    result: null,
    entries: [
      pitch('e4', 't-safety', 'SafeRide', 'Ghana', 'security', 'Women-only night buses in Accra, booked and tracked by SMS.', 44),
      pitch('e5', 't-safety', 'Shield', 'Nigeria', 'gbv', 'A panic button in USSD that reaches the nearest trained responder.', 38),
      pitch('e6', 't-safety', 'LitPath', 'Senegal', 'security', 'Solar street lighting mapped from where women report feeling unsafe.', 15),
    ],
  },
  {
    id: 't-health',
    name: 'Health and care',
    position: 2,
    voting: 'pending',
    closedAt: null,
    createdAt: '2027-09-01T09:02:00Z',
    voters: 0,
    result: null,
    entries: [
      pitch('e7', 't-health', 'MumCare', 'Nigeria', 'health', 'Antenatal check-ins by voice note for mothers far from a clinic.'),
      pitch('e8', 't-health', 'CareShare', 'Rwanda', 'economic', 'Shared childcare co-operatives for women in informal work.'),
    ],
  },
];
const demoSet = (next: PitchTopic[]) => (demoTopics = sortTopics(next));
const demoTally = (t: PitchTopic): TopicTally => ({
  topicId: t.id,
  counts: t.entries.filter((e) => e.voteCount > 0).map((e) => ({ entryId: e.id, votes: e.voteCount })),
  voters: t.entries.reduce((n, e) => n + e.voteCount, 0),
});

/* ---------------------------------------------------------------------- hooks */

/**
 * Every topic with its pitches and standing, kept current over the socket: live tallies, topics
 * opening and closing. Changes to topics and pitches made elsewhere refresh the list.
 */
export function useTopics(editionId: string | undefined) {
  const client = useQueryClient();
  const socket = useRealtimeSocket();
  const KEY = useMemo(() => topicsKey(editionId), [editionId]);

  const query = useQuery({
    queryKey: KEY,
    enabled: DEMO_MODE || Boolean(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoTopics) : api.get<PitchTopic[]>('/voting/topics', { editionId }, signal).then(sortTopics)),
  });

  useEffect(() => {
    const apply = (event: VotingEvent) => client.setQueryData<PitchTopic[]>(KEY, (was) => (was ? applyVotingEvent(was, event) : was));
    const refresh = () => void client.invalidateQueries({ queryKey: KEY });

    if (DEMO_MODE) {
      // The room voting on the open topic.
      const timer = setInterval(() => {
        const open = demoTopics.find((t) => t.voting === 'open');
        if (!open) return;
        const pick = open.entries[Math.floor(Math.random() * open.entries.length)];
        if (!pick) return;
        const next = { ...open, entries: open.entries.map((e) => (e.id === pick.id ? { ...e, voteCount: e.voteCount + 1 } : e)) };
        demoSet(demoTopics.map((t) => (t.id === open.id ? { ...next, voters: next.voters + 1 } : t)));
        apply({ type: 'voting:tally', payload: demoTally(next) });
      }, 1200);
      return () => clearInterval(timer);
    }

    if (!socket) return;
    const handlers: Record<string, (payload: never) => void> = {
      'voting:tally': (payload: TopicTally) => apply({ type: 'voting:tally', payload }),
      'voting:opened': (payload: { topicId: string }) => apply({ type: 'voting:opened', payload }),
      'voting:closed': (payload: TopicTally | null) => apply({ type: 'voting:closed', payload }),
      'voting:topic-updated': refresh,
      'voting:topic-deleted': refresh,
      'voting:entry-updated': refresh,
      'voting:entry-deleted': refresh,
    };
    const join = () => {
      socket.emit('voting:join');
      refresh();
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn as (payload: unknown) => void);
    socket.on('connect', join);
    if (socket.connected) socket.emit('voting:join');
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn as (payload: unknown) => void);
      socket.off('connect', join);
      socket.emit('voting:leave');
    };
  }, [socket, client, KEY]);

  return query;
}

/** Topic and pitch changes (organisers only, as the API requires). Each refreshes the list. */
export function usePitchathonActions(editionId: string | undefined) {
  const client = useQueryClient();
  const KEY = topicsKey(editionId);
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const demo = <T,>(change: (topics: PitchTopic[]) => PitchTopic[], value: T) => {
    demoSet(change(demoTopics));
    return Promise.resolve(value);
  };

  const saveTopic = useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }): Promise<{ id: string }> => {
      if (!DEMO_MODE) {
        return id
          ? api.patch<{ id: string }>(`/voting/topics/${id}`, { name })
          : api.post<{ id: string }>('/voting/topics', { name, editionId, position: (client.getQueryData<PitchTopic[]>(KEY)?.length ?? 0) });
      }
      if (id) return demo((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)), { id });
      const created: PitchTopic = { id: `t-${Date.now()}`, name, position: demoTopics.length, voting: 'pending', result: null, closedAt: null, createdAt: new Date().toISOString(), entries: [], voters: 0 };
      return demo((ts) => [...ts, created], { id: created.id });
    },
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: async (changes: { id: string; position: number }[]) => {
      if (DEMO_MODE) return demo((ts) => ts.map((t) => ({ ...t, position: changes.find((c) => c.id === t.id)?.position ?? t.position })), undefined);
      for (const c of changes) await api.patch(`/voting/topics/${c.id}`, { position: c.position });
    },
    onSuccess: refresh,
  });

  const setVoting = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'open' | 'close' }) => {
      if (!DEMO_MODE) return api.post(`/voting/topics/${id}/${action}`);
      return demo(
        (ts) =>
          ts.map((t) =>
            t.id !== id ? t : action === 'open' ? { ...t, voting: 'open' } : { ...t, voting: 'closed', closedAt: new Date().toISOString(), result: demoTally(t) },
          ),
        undefined,
      );
    },
    onSuccess: refresh,
  });

  const removeTopic = useMutation({
    mutationFn: ({ id }: { id: string }) => (DEMO_MODE ? demo((ts) => ts.filter((t) => t.id !== id), undefined) : api.delete(`/voting/topics/${id}`)),
    onSuccess: refresh,
  });

  const savePitch = useMutation({
    mutationFn: ({ id, topicId, body }: { id?: string; topicId: string; body: PitchForm }) => {
      if (!DEMO_MODE) return id ? api.patch(`/voting/entries/${id}`, body) : api.post('/voting/entries', { ...body, topicId });
      const saved: PitchEntry = { id: id ?? `e-${Date.now()}`, topicId, voteCount: 0, ...body };
      return demo(
        (ts) =>
          ts.map((t) =>
            t.id !== topicId ? t : { ...t, entries: id ? t.entries.map((e) => (e.id === id ? { ...e, ...body } : e)) : [...t.entries, saved] },
          ),
        undefined,
      );
    },
    onSuccess: refresh,
  });

  const removePitch = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      DEMO_MODE ? demo((ts) => ts.map((t) => ({ ...t, entries: t.entries.filter((e) => e.id !== id) })), undefined) : api.delete(`/voting/entries/${id}`),
    onSuccess: refresh,
  });

  return { saveTopic, reorder, setVoting, removeTopic, savePitch, removePitch };
}
