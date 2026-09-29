'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { useRealtimeEvents } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import type { Session, toSessionBody } from '@/lib/programme/programme';

const key = (editionId: string | undefined) => ['admin', 'sessions', editionId ?? 'none'] as const;

const at = (day: number, hm: string) => `2027-09-0${6 + day}T${hm}:00+01:00`;
const speaker = (id: string, name: string, role: string) => ({ id, name, role, organisation: null, avatarUrl: null });

/** Sample programme for demo mode, shaped like `GET /sessions`. */
const DEMO_SESSIONS: Session[] = [
  { id: 'd1', title: 'Opening plenary: inclusion that scales', description: 'Welcome and framing for the two days.', day: 1, startsAt: at(1, '09:00'), endsAt: at(1, '10:00'), track: 'general', type: 'plenary', status: 'scheduled', room: 'Main Hall', editionId: 'demo-gs27', speakers: [speaker('s1', 'Amina Yusuf', 'Director, PIC')] },
  { id: 'd2', title: 'Digital IDs and the last mile', description: 'Who gets left out when services go digital.', day: 1, startsAt: at(1, '10:30'), endsAt: at(1, '11:45'), track: 'digital', type: 'panel', status: 'scheduled', room: 'Hall A', editionId: 'demo-gs27', speakers: [speaker('s2', 'Tunde Bakare', 'CTO'), speaker('s3', 'Grace Obi', 'Researcher')] },
  { id: 'd3', title: 'Lunch', description: 'Garden terrace.', day: 1, startsAt: at(1, '12:00'), endsAt: at(1, '13:00'), track: 'general', type: 'break', status: 'scheduled', room: 'Garden Terrace', editionId: 'demo-gs27', speakers: [] },
  { id: 'd4', title: 'Women in trade finance', description: 'Closing the credit gap for women-led SMEs.', day: 1, startsAt: at(1, '13:00'), endsAt: at(1, '14:30'), track: 'economic', type: 'roundtable', status: 'scheduled', room: 'Hall B', editionId: 'demo-gs27', speakers: [speaker('s4', 'Kwame Mensah', 'Economist')] },
  { id: 'd5', title: 'Safe transport after dark', description: 'Designing transit that women can rely on.', day: 2, startsAt: at(2, '09:30'), endsAt: at(2, '10:30'), track: 'security', type: 'workshop', status: 'scheduled', room: 'Hall A', editionId: 'demo-gs27', speakers: [] },
  { id: 'd6', title: 'Closing ceremony', description: 'Commitments and thanks.', day: 2, startsAt: at(2, '16:00'), endsAt: at(2, '17:00'), track: 'general', type: 'closing', status: 'scheduled', room: 'Main Hall', editionId: 'demo-gs27', speakers: [speaker('s1', 'Amina Yusuf', 'Director, PIC')] },
];

/** An edition's sessions, flat and in start order (organisers see speakers before the reveal). */
export function useSessions(editionId: string | undefined) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve(DEMO_SESSIONS) : api.get<Session[]>('/sessions', { editionId }, signal),
    enabled: !!editionId,
  });
}

/** Refreshes every programme on screen when sessions change anywhere (another console, going live). */
export function useSessionsRealtime() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ['admin', 'sessions'] });
  useRealtimeEvents({
    'session:status': refresh,
    'session:created': refresh,
    'session:updated': refresh,
    'session:deleted': refresh,
    'sessions:shifted': refresh,
  });
}

/** Adds a session and refreshes that edition's programme. */
export function useCreateSession(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof toSessionBody>) =>
      DEMO_MODE
        ? Promise.resolve<Session>({ ...body, id: `demo-${Date.now()}`, status: 'scheduled', speakers: [] })
        : api.post<Session>('/sessions', body),
    onSuccess: (created) => {
      client.setQueryData<Session[]>(key(editionId), (was) => [...(was ?? []), created]);
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: key(editionId) });
    },
  });
}

/** Replaces a session's speakers (`PATCH /sessions/:id` with `speakerIds`), updating the list straight away. */
export function useSetSessionSpeakers(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ session, speakers }: { session: Session; speakers: Session['speakers'] }) =>
      DEMO_MODE
        ? Promise.resolve<Session>({ ...session, speakers })
        : api.patch<Session>(`/sessions/${session.id}`, { speakerIds: speakers.map((s) => s.id) }),
    onSuccess: (saved, { session, speakers }) => {
      client.setQueryData<Session[]>(key(editionId), (was) => was?.map((s) => (s.id === session.id ? { ...s, speakers: saved.speakers ?? speakers } : s)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: key(editionId) });
    },
  });
}

/** Saves a session's details. The API tells delegates about a time or room change itself. */
export function useUpdateSession(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ session, body }: { session: Session; body: Omit<ReturnType<typeof toSessionBody>, 'editionId'> }) =>
      DEMO_MODE ? Promise.resolve<Session>({ ...session, ...body }) : api.patch<Session>(`/sessions/${session.id}`, body),
    onSuccess: (saved, { session }) => {
      client.setQueryData<Session[]>(key(editionId), (was) => was?.map((s) => (s.id === session.id ? { ...s, ...saved, speakers: saved.speakers ?? s.speakers } : s)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: key(editionId) });
    },
  });
}

/** Deletes a session. The API refuses, naming what is in the way, if delegates have used it. */
export function useDeleteSession(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => (DEMO_MODE ? Promise.resolve() : api.delete<void>(`/sessions/${id}`)),
    onSuccess: (_void, id) => {
      client.setQueryData<Session[]>(key(editionId), (was) => was?.filter((s) => s.id !== id));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: key(editionId) });
    },
  });
}
