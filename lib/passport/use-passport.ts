'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { Booth, DrawEntry } from '@/lib/passport/passport';

const key = (editionId: string | undefined) => ['admin', 'passport', editionId ?? 'none'] as const;

let demoBooths: Booth[] = [
  { id: 'b1', name: 'UN Women Nigeria', code: 'K7M2PX', location: 'Exhibition hall, stand 3', isActive: true, sortOrder: 0, stamps: 184 },
  { id: 'b2', name: 'Women in Tech Africa', code: 'R4TQ9H', location: 'Exhibition hall, stand 7', isActive: true, sortOrder: 1, stamps: 142 },
  { id: 'b3', name: 'NIMC enrolment desk', code: 'WZ3N8C', location: 'Foyer', isActive: true, sortOrder: 2, stamps: 96 },
  { id: 'b4', name: 'Policy Innovation Centre', code: 'PJ6D2L', location: 'Exhibition hall, stand 1', isActive: true, sortOrder: 3, stamps: 211 },
  { id: 'b5', name: 'Sponsor lounge', code: 'G5HX7B', location: 'Level 1', isActive: false, sortOrder: 4, stamps: 23 },
];
const DEMO_WINNERS: DrawEntry[] = [
  { id: 'w1', name: 'Hauwa Bello', email: 'hauwa@example.org', organisation: 'Women in Tech Africa', completedAt: '2027-09-07T12:14:00Z' },
  { id: 'w2', name: 'Samuel Adeyemi', email: 'samuel@example.org', organisation: 'Lagos Business School', completedAt: '2027-09-07T13:02:00Z' },
  { id: 'w3', name: 'Chioma Okafor', email: 'chioma@example.org', organisation: null, completedAt: '2027-09-07T15:40:00Z' },
  { id: 'w4', name: 'Ibrahim Musa', email: 'ibrahim@example.org', organisation: 'Kano State Ministry of Women Affairs', completedAt: '2027-09-07T11:30:00Z' },
];
const code = () => Array.from({ length: 6 }, () => 'BCDFGHJKLMNPQRSTVWXYZ23456789'[Math.floor(Math.random() * 29)]).join('');

/** The edition's stands, in display order, with their stamp counts (refreshed every 30 s). */
export function useBooths(editionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoBooths) : api.get<Booth[]>(`/editions/${editionId}/booths`, undefined, signal)),
    enabled: enabled && !!editionId,
    refetchInterval: 30_000,
  });
}

export type BoothBody = { name: string; location: string; description: string };

/** Add, edit, switch on and off, and delete stands. The API generates each stand's code. */
export function useBoothActions(editionId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: key(editionId) });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: BoothBody }): Promise<Booth> => {
      const payload = { name: body.name, location: body.location || undefined, description: body.description || undefined };
      if (!DEMO_MODE) return id ? api.patch<Booth>(`/booths/${id}`, payload) : api.post<Booth>(`/editions/${editionId}/booths`, { ...payload, sortOrder: demoBooths.length });
      if (id) {
        demoBooths = demoBooths.map((b) => (b.id === id ? { ...b, name: body.name, location: body.location || null } : b));
        return Promise.resolve(demoBooths.find((b) => b.id === id)!);
      }
      const created: Booth = { id: `b-${Date.now()}`, name: body.name, location: body.location || null, code: code(), isActive: true, sortOrder: demoBooths.length, stamps: 0 };
      demoBooths = [...demoBooths, created];
      return Promise.resolve(created);
    },
    onSuccess: refresh,
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!DEMO_MODE) return api.patch(`/booths/${id}`, { isActive });
      demoBooths = demoBooths.map((b) => (b.id === id ? { ...b, isActive } : b));
      return Promise.resolve();
    },
    onMutate: ({ id, isActive }) => {
      const before = client.getQueryData<Booth[]>(key(editionId));
      client.setQueryData<Booth[]>(key(editionId), (was) => was?.map((b) => (b.id === id ? { ...b, isActive } : b)));
      return { before };
    },
    onError: (_error: Error, _vars, context) => context?.before && client.setQueryData(key(editionId), context.before),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!DEMO_MODE) return api.delete(`/booths/${id}`);
      demoBooths = demoBooths.filter((b) => b.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  /** Random delegates who stamped every active stand. Each draw is a fresh random pick. */
  const draw = useMutation({
    mutationFn: (count: number): Promise<DrawEntry[]> =>
      DEMO_MODE
        ? Promise.resolve([...DEMO_WINNERS].sort(() => Math.random() - 0.5).slice(0, count))
        : api.get<DrawEntry[]>(`/editions/${editionId}/passport/draw`, { count }),
  });

  return { save, setActive, remove, draw };
}
