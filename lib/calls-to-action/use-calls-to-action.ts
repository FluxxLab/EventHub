'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { AnalyseResult, CallToAction, CallsToActionBoard, toBody } from '@/lib/calls-to-action/calls-to-action';
import { DEMO_MODE } from '@/lib/demo';

const boardKey = (editionId: string) => ['admin', 'calls-to-action', editionId] as const;

const DEMO: CallsToActionBoard = { aiReady: false, items: [], analyses: [] };

/** The event's calls to action, where each session's analysis has got to, and whether Analyse is on. */
export function useCallsToAction(editionId: string) {
  return useQuery({
    queryKey: boardKey(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO) : api.get<CallsToActionBoard>(`/editions/${editionId}/calls-to-action`, undefined, signal)),
  });
}

/** Who a call may be directed at: the usual groups and the event's own organisations. */
export function useCallTargets(editionId: string) {
  return useQuery({
    queryKey: ['admin', 'calls-to-action-targets', editionId],
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(['Federal Government', 'Private sector']) : api.get<string[]>(`/editions/${editionId}/calls-to-action/targets`, undefined, signal)),
    staleTime: 60_000,
  });
}

type Body = ReturnType<typeof toBody>;

export function useCallActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: boardKey(editionId) });

  /** Reads what the session said since its last analysis; a minute or two for a long session. */
  const analyse = useMutation({
    mutationFn: (sessionId: string) =>
      DEMO_MODE ? Promise.resolve<AnalyseResult>({ added: [], read: 0, message: 'Analysis needs the server.' }) : api.post<AnalyseResult>(`/sessions/${sessionId}/analyse`),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (body: Body & { sessionId: string | null }) => api.post<CallToAction>(`/editions/${editionId}/calls-to-action`, body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Body> & { status?: 'suggested' | 'approved' | 'rejected' } }) => api.patch<CallToAction>(`/calls-to-action/${id}`, body),
    onSuccess: (saved) => {
      client.setQueryData<CallsToActionBoard>(boardKey(editionId), (was) => (was ? { ...was, items: was.items.map((c) => (c.id === saved.id ? saved : c)) } : was));
    },
  });
  const merge = useMutation({
    mutationFn: ({ into, ids }: { into: string; ids: string[] }) => api.post<CallToAction>('/calls-to-action/merge', { into, ids }),
    onSuccess: refresh,
  });
  return { analyse, create, update, merge };
}
