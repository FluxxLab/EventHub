'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition, toCreateBody } from '@/lib/events/events';
import { uploadFile } from '@/lib/uploads';

const KEY = ['admin', 'editions'] as const;

/** Sample editions for demo mode, shaped like `GET /editions`. */
const DEMO_EDITIONS: Edition[] = [
  {
    id: 'demo-gs27',
    name: 'GS-27 Gender & Inclusion Summit',
    shortName: 'GS-27',
    startsAt: '2027-09-07T08:00:00+01:00',
    endsAt: '2027-09-08T17:00:00+01:00',
    venue: 'Transcorp Hilton',
    city: 'Abuja',
    category: 'summits',
    status: 'announced',
    registrationOpen: true,
    isCurrent: true,
    trackValues: ['digital', 'economic', 'gbv', 'health', 'security'],
    interestValues: ['Policy', 'Health', 'Education', 'Technology', 'Finance', 'Agriculture', 'Climate', 'Youth', 'Media', 'Law', 'Research', 'Entrepreneurship'],
    coverImage: null,
    createdAt: '2027-02-01T09:00:00+01:00',
  },
  {
    id: 'demo-pw',
    name: 'Policy Writing Workshop',
    shortName: 'PWW',
    startsAt: '2027-06-12T09:00:00+01:00',
    endsAt: '2027-06-12T16:00:00+01:00',
    venue: 'PIC Hub',
    city: 'Lagos',
    category: 'workshops',
    status: 'draft',
    registrationOpen: false,
    isCurrent: false,
    trackValues: ['policy-drafting'],
    interestValues: ['Policy', 'Law', 'Research'],
    coverImage: null,
    createdAt: '2027-03-10T09:00:00+01:00',
  },
  {
    id: 'demo-gs26',
    name: 'GS-26 Gender & Inclusion Summit',
    shortName: 'GS-26',
    startsAt: '2026-09-08T08:00:00+01:00',
    endsAt: '2026-09-09T17:00:00+01:00',
    venue: 'Transcorp Hilton',
    city: 'Abuja',
    category: 'summits',
    status: 'ended',
    registrationOpen: false,
    isCurrent: false,
    trackValues: ['digital', 'economic', 'gbv', 'health', 'security'],
    interestValues: ['Policy', 'Health', 'Education', 'Technology', 'Finance', 'Youth'],
    coverImage: null,
    createdAt: '2026-02-01T09:00:00+01:00',
  },
];

/** Every edition, newest first (organisers only). */
export function useEditions() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO_EDITIONS) : api.get<Edition[]>('/editions', undefined, signal)),
  });
}

/** Creates an edition (it starts as a draft) and refreshes the list. */
export function useCreateEdition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof toCreateBody> & { trackValues?: string[]; interestValues?: string[] }) =>
      DEMO_MODE
        ? Promise.resolve<Edition>({
            ...body,
            id: `demo-${Date.now()}`,
            venue: body.venue ?? null,
            city: body.city ?? null,
            status: 'draft',
            registrationOpen: false,
            isCurrent: false,
            coverImage: null,
            createdAt: new Date().toISOString(),
          })
        : api.post<Edition>('/editions', body),
    onSuccess: (created) => {
      // Show it straight away, then confirm against the server.
      client.setQueryData<Edition[]>(KEY, (was) => (was ? [created, ...was] : [created]));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Branding changes for one event: a new file uploads and replaces, null removes, undefined leaves it. */
export type BrandingChange = { cover?: File | null; logo?: File | null; brandColor?: string | null };

/**
 * Saves an event's cover, logo and button colour. Files upload straight to storage on a signed URL
 * and are then set on the event (the API deletes the one they replace). In demo mode the pictures
 * show from the browser for the session.
 */
export function useSaveBranding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ editionId, change, onProgress }: { editionId: string; change: BrandingChange; onProgress?: (label: string) => void }) => {
      const patch: Partial<Edition> = {};
      if (DEMO_MODE) {
        if (change.cover !== undefined) patch.coverUrl = change.cover ? URL.createObjectURL(change.cover) : null;
        if (change.logo !== undefined) patch.logoUrl = change.logo ? URL.createObjectURL(change.logo) : null;
        if (change.brandColor !== undefined) patch.brandColor = change.brandColor;
        return patch;
      }
      for (const kind of ['cover', 'logo'] as const) {
        const file = change[kind];
        if (file === undefined) continue;
        if (file === null) {
          await api.delete(`/editions/${editionId}/${kind}`);
          patch[`${kind}Url`] = null;
          continue;
        }
        onProgress?.(kind === 'cover' ? 'Uploading the picture…' : 'Uploading the logo…');
        const key = await uploadFile(file, { presignPath: `/editions/${editionId}/${kind}-upload`, contentType: file.type }, () => undefined);
        const saved = await api.put<{ coverUrl?: string | null; logoUrl?: string | null }>(`/editions/${editionId}/${kind}`, kind === 'cover' ? { coverImage: key } : { logoImage: key });
        patch[`${kind}Url`] = saved[`${kind}Url`] ?? null;
      }
      if (change.brandColor !== undefined) {
        await api.patch(`/editions/${editionId}`, { brandColor: change.brandColor });
        patch.brandColor = change.brandColor;
      }
      return patch;
    },
    onSuccess: (patch, { editionId }) => {
      client.setQueryData<Edition[]>(KEY, (was) => was?.map((e) => (e.id === editionId ? { ...e, ...patch } : e)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Saves the event's details (name, dates, place, category). */
export function useUpdateEdition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Edition> }) =>
      DEMO_MODE ? Promise.resolve({ id, ...body } as Edition) : api.patch<Edition>(`/editions/${id}`, body),
    onSuccess: (saved, { id, body }) => {
      client.setQueryData<Edition[]>(KEY, (was) => was?.map((e) => (e.id === id ? { ...e, ...body, ...saved } : e)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Deletes an event. The API refuses (with the reason) unless nothing is in it yet. */
export function useDeleteEdition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => (DEMO_MODE ? Promise.resolve() : api.delete<void>(`/editions/${id}`)),
    onSuccess: (_void, id) => {
      client.setQueryData<Edition[]>(KEY, (was) => was?.filter((e) => e.id !== id));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: KEY });
    },
  });
}
