'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { BriefSummary, SessionBrief } from '@/lib/programme/briefs';

const listKey = (editionId: string | undefined) => ['admin', 'session-briefs', editionId ?? 'none'] as const;
const oneKey = (sessionId: string | undefined) => ['admin', 'session-brief', sessionId ?? 'none'] as const;

const demoBriefs = new Map<string, SessionBrief>();

/** Which of an edition's sessions have a brief, by session id. */
export function useSessionBriefs(editionId: string | undefined) {
  return useQuery({
    queryKey: listKey(editionId),
    queryFn: async ({ signal }) => {
      const list = DEMO_MODE
        ? [...demoBriefs].filter(([, b]) => b.text).map(([sessionId, b]) => ({ sessionId, fileName: b.fileName, updatedAt: b.updatedAt }))
        : await api.get<BriefSummary[]>('/sessions/briefs', { editionId }, signal);
      return new Map(list.map((b) => [b.sessionId, b]));
    },
    enabled: !!editionId,
  });
}

/** One session's brief, with its text. */
export function useSessionBrief(sessionId: string | undefined) {
  return useQuery({
    queryKey: oneKey(sessionId),
    queryFn: ({ signal }) =>
      DEMO_MODE
        ? Promise.resolve(demoBriefs.get(sessionId!) ?? { text: null, fileName: null, updatedAt: null })
        : api.get<SessionBrief>(`/sessions/${sessionId}/brief`, undefined, signal),
    enabled: !!sessionId,
  });
}

/** Replaces a session's brief (`PUT /sessions/:id/brief`); empty text removes it. */
export function useSetSessionBrief(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, text, fileName }: { sessionId: string; text: string; fileName: string | null }) => {
      if (!DEMO_MODE) return api.put<SessionBrief>(`/sessions/${sessionId}/brief`, { text, ...(fileName ? { fileName } : {}) });
      const saved = text.trim() ? { text: text.trim(), fileName, updatedAt: new Date().toISOString() } : { text: null, fileName: null, updatedAt: null };
      demoBriefs.set(sessionId, saved);
      return Promise.resolve(saved);
    },
    onSuccess: (saved, { sessionId }) => {
      client.setQueryData(oneKey(sessionId), saved);
      void client.invalidateQueries({ queryKey: listKey(editionId) });
    },
  });
}
