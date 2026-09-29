'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { InterestOption, TrackOption } from '@/lib/catalog/topics';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';

const TRACKS = ['admin', 'catalog', 'tracks'] as const;
const INTERESTS = ['admin', 'catalog', 'interests'] as const;
const EDITIONS = ['admin', 'editions'] as const;

const demoTracks: TrackOption[] = [
  ['digital', 'Inclusive Digital Transformation', 'Access, skills and platforms that leave no one out'],
  ['economic', 'Economic Inclusion', 'Finance, enterprise and work'],
  ['gbv', 'Gender-Based Violence (GBV)', 'Prevention, response and justice'],
  ['health', 'Health & Nutrition', 'Maternal health, nutrition and care'],
  ['security', 'Security & Transportation', 'Safe movement and safe communities'],
  ['policy-drafting', 'Policy Drafting', 'Writing briefs, bills and memos'],
].map(([value, label, hint], sortOrder) => ({ id: value, value, label, hint, sortOrder, isActive: true }));

const demoInterests: InterestOption[] = ['Policy', 'Health', 'Education', 'Technology', 'Finance', 'Agriculture', 'Climate', 'Youth', 'Media', 'Law', 'Research', 'Entrepreneurship'].map(
  (value, sortOrder) => ({ id: value, value, label: value, sortOrder, isActive: true }),
);

/** The track library, retired tracks included (organisers only). */
export function useTrackLibrary() {
  return useQuery({
    queryKey: TRACKS,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve([...demoTracks]) : api.get<TrackOption[]>('/catalog/tracks', undefined, signal)),
    staleTime: 5 * 60_000,
  });
}

/** The interest library, retired ones included (organisers only). */
export function useInterestLibrary() {
  return useQuery({
    queryKey: INTERESTS,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve([...demoInterests]) : api.get<InterestOption[]>('/catalog/interests', undefined, signal)),
    staleTime: 5 * 60_000,
  });
}

/** Adds a track to the library; the new one is returned so the caller can tick it. */
export function useCreateTrack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { label: string; hint?: string }): Promise<TrackOption> => {
      const { label, hint } = typeof input === 'string' ? { label: input, hint: undefined } : input;
      if (!DEMO_MODE) return api.post<TrackOption>('/catalog/tracks', { label, ...(hint ? { hint } : {}) });
      const value = label.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
      const created = { id: value, value, label, hint: hint ?? '', sortOrder: demoTracks.length, isActive: true };
      demoTracks.push(created);
      return created;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: TRACKS }),
  });
}

/** Adds an interest to the library; its label is its value. */
export function useCreateInterest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (label: string): Promise<InterestOption> => {
      if (!DEMO_MODE) return api.post<InterestOption>('/catalog/interests', { value: label });
      const created = { id: label, value: label, label, sortOrder: demoInterests.length, isActive: true };
      demoInterests.push(created);
      return created;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: INTERESTS }),
  });
}

export type EditionTopics = { trackValues: string[]; interestValues: string[] };

/** Replaces an event's tracks and interests. */
export function useSaveEditionTopics() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ editionId, ...topics }: EditionTopics & { editionId: string }) =>
      DEMO_MODE ? Promise.resolve({ id: editionId, ...topics } as Edition) : api.patch<Edition>(`/editions/${editionId}`, topics),
    onSuccess: (_saved, { editionId, ...topics }) => {
      client.setQueryData<Edition[]>(EDITIONS, (was) => was?.map((e) => (e.id === editionId ? { ...e, ...topics } : e)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: EDITIONS });
    },
  });
}

/* ------------------------------------------------------ library upkeep (Settings) */

type Kind = 'track' | 'interest';
const kindKey = (kind: Kind) => (kind === 'track' ? TRACKS : INTERESTS);
const kindPath = (kind: Kind) => (kind === 'track' ? '/catalog/tracks' : '/catalog/interests');
const demoList = (kind: Kind): (TrackOption | InterestOption)[] => (kind === 'track' ? demoTracks : demoInterests);

export type TopicPatch = { label?: string; hint?: string; sortOrder?: number; isActive?: boolean };

/** Relabels, re-hints, reorders or retires options; several patches go as one action (a reorder). */
export function useUpdateTopics(kind: Kind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patches: ({ id: string } & TopicPatch)[]) => {
      if (DEMO_MODE) {
        for (const { id, ...patch } of patches) {
          const row = demoList(kind).find((o) => o.id === id);
          if (row) Object.assign(row, patch);
        }
        return;
      }
      // interests have no hint, and the API refuses fields it does not know
      await Promise.all(patches.map(({ id, hint, ...rest }) => api.patch(`${kindPath(kind)}/${id}`, kind === 'track' && hint !== undefined ? { ...rest, hint } : rest)));
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: kindKey(kind) }),
  });
}

/** Deletes an option. A track that sessions are filed under is refused (409) with the reason. */
export function useDeleteTopic(kind: Kind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) {
        const list = demoList(kind);
        const at = list.findIndex((o) => o.id === id);
        if (at >= 0) list.splice(at, 1);
        return;
      }
      await api.delete(`${kindPath(kind)}/${id}`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: kindKey(kind) });
      // events that had it lose it
      void client.invalidateQueries({ queryKey: EDITIONS });
    },
  });
}
