'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { IngestRoom, StreamCredentials, StreamInput } from '@/lib/ingest/ingest';

const KEY = ['admin', 'ingest', 'rooms'] as const;

let demo: IngestRoom[] = [
  { room: 'Main Hall', stream: { id: 'IN_main', input: 'rtmp', url: 'rtmps://pic-events.rtmp.livekit.cloud/x', state: 'publishing', diarise: false }, captioning: 'ingest' },
  { room: 'Hall A', stream: { id: 'IN_a', input: 'rtmp', url: 'rtmps://pic-events.rtmp.livekit.cloud/x', state: 'inactive', diarise: true }, captioning: null },
  { room: 'Hall B', stream: null, captioning: 'desk' },
  { room: 'Garden Terrace', stream: null, captioning: null },
];
const demoKey = () => `sk_${Math.random().toString(36).slice(2, 14)}`;

/**
 * The venue's rooms with their streams, refreshed every 10 s so an encoder coming online shows
 * without a reload. `disabled` when the API has venue streams switched off (it answers 503).
 */
export function useIngestRooms() {
  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demo) : api.get<IngestRoom[]>('/ingest/rooms', undefined, signal)),
    refetchInterval: (q) => (q.state.error instanceof ApiError && q.state.error.status === 503 ? false : 10_000),
    retry: false,
  });
  const disabled = query.error instanceof ApiError && query.error.status === 503;
  return { ...query, disabled };
}

const path = (room: string) => `/ingest/rooms/${encodeURIComponent(room)}`;

/** Create, rotate and remove a room's stream. Create and rotate return the key, once. */
export function useIngestActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: ({ room, input, diarise }: { room: string; input: StreamInput; diarise: boolean }): Promise<StreamCredentials> => {
      if (!DEMO_MODE) return api.post<StreamCredentials>(path(room), { input, diarise });
      const url = input === 'whip' ? 'https://pic-events.whip.livekit.cloud/w' : 'rtmps://pic-events.rtmp.livekit.cloud/x';
      demo = demo.map((r) => (r.room === room ? { ...r, stream: { id: `IN_${room}`, input, url, state: 'inactive', diarise } } : r));
      return Promise.resolve({ room, input, url, streamKey: demoKey() });
    },
    onSuccess: refresh,
  });

  const rotate = useMutation({
    mutationFn: ({ room }: { room: string }): Promise<StreamCredentials> => {
      if (!DEMO_MODE) return api.post<StreamCredentials>(`${path(room)}/rotate`, {});
      const stream = demo.find((r) => r.room === room)?.stream;
      return Promise.resolve({ room, input: stream?.input ?? 'rtmp', url: stream?.url ?? '', streamKey: demoKey() });
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: ({ room }: { room: string }) => {
      if (!DEMO_MODE) return api.delete<void>(path(room));
      demo = demo.map((r) => (r.room === room ? { ...r, stream: null } : r));
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  return { create, rotate, remove };
}
