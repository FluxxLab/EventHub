'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';
import type { Room, toRoomBody } from '@/lib/venue/venue';

const EDITIONS = ['admin', 'editions'] as const;
const rooms = (editionId: string | undefined) => ['admin', 'rooms', editionId ?? 'none'] as const;

let demoRooms: Room[] = [
  { id: 'r1', name: 'Main Hall', floor: 'Ground floor', notes: 'Plenaries; 600 seats, captions screen left.', sessionCount: 3 },
  { id: 'r2', name: 'Hall A', floor: 'First floor', notes: null, sessionCount: 2 },
  { id: null, name: 'Hall B', floor: null, notes: null, sessionCount: 1 },
  { id: 'r3', name: 'Garden Terrace', floor: 'Ground floor', notes: 'Lunch and networking.', sessionCount: 1 },
];

/**
 * The edition's rooms. The API hides draft editions from this route (404, even for organisers),
 * so a 404 on a draft is reported as `hiddenWhileDraft` rather than as an error.
 */
export function useRooms(edition: Edition | undefined) {
  const query = useQuery({
    queryKey: rooms(edition?.id),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoRooms) : api.get<Room[]>(`/editions/${edition!.id}/rooms`, undefined, signal)),
    enabled: !!edition,
    retry: false,
  });
  const hiddenWhileDraft = edition?.status === 'draft' && query.error instanceof ApiError && query.error.status === 404;
  return { ...query, hiddenWhileDraft };
}

/** Saves the venue fields on the edition and updates the cached event list. */
export function useSaveVenue(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, string | number | null>) =>
      DEMO_MODE ? Promise.resolve({ id: editionId, ...patch } as unknown as Edition) : api.patch<Edition>(`/editions/${editionId}`, patch),
    onSuccess: (saved) => {
      client.setQueryData<Edition[]>(EDITIONS, (was) => was?.map((e) => (e.id === editionId ? { ...e, ...saved } : e)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: EDITIONS });
    },
  });
}

type RoomBody = ReturnType<typeof toRoomBody>;

/** Adds, edits or removes a described room, then refreshes the list (session counts come from the server). */
export function useRoomMutations(editionId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: rooms(editionId) });

  const create = useMutation({
    mutationFn: (body: RoomBody) => {
      if (!DEMO_MODE) return api.post<Room>(`/editions/${editionId}/rooms`, body);
      const room = { id: `demo-${Date.now()}`, sessionCount: 0, ...body };
      demoRooms = [...demoRooms.filter((r) => r.name.toLowerCase() !== body.name.toLowerCase()), { ...room, sessionCount: demoRooms.find((r) => r.name === body.name)?.sessionCount ?? 0 }];
      return Promise.resolve(room);
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoomBody }) => {
      if (!DEMO_MODE) return api.patch<Room>(`/editions/rooms/${id}`, body);
      demoRooms = demoRooms.map((r) => (r.id === id ? { ...r, ...body } : r));
      return Promise.resolve(demoRooms.find((r) => r.id === id)!);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/editions/rooms/${id}`);
      demoRooms = demoRooms.filter((r) => r.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });
  return { create, update, remove };
}
