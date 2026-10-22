'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api/client';
import { useRealtimeSocket } from '@/lib/api/realtime';
import type { RoomState } from '@/lib/captions/room-capture';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Running a sound desk from another computer. The desk (the laptop at the mixer, Sound desk open)
 * reports its channels, patches and rooms on air; an organiser elsewhere patches, starts and stops
 * rooms on it from their own console; the desk does it as if clicked there.
 */

export type DeskChannel = { value: string; label: string };
export type DeskRoom = { room: string; source: string | null; status: string | null; message: string | null };
export type RemoteDesk = { deskId: string; name: string; connected: boolean; channels: DeskChannel[]; rooms: DeskRoom[]; reportedAt: string };
export type DeskCommand = { id: string; action: 'patch' | 'start' | 'stop'; room: string; source?: string; by: string };

const ID_KEY = 'pic.admin.desk-id';
const REPORT_MS = 10_000;

/** This computer's desk id, made once and kept, so the remote panel can tell desks apart and leave itself out. */
export function thisDeskId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).toLowerCase();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'this-desk';
  }
}

/**
 * On the desk: report what it has every few seconds (and at once after a change), and carry out
 * requests from other computers. Reports only once its audio inputs are open, since until then
 * nothing can be patched or started from anywhere.
 */
export function useDeskReporting(opts: {
  connected: boolean;
  name: string;
  channels: DeskChannel[];
  rooms: string[];
  sourceOf: (room: string) => string | null;
  states: Record<string, RoomState>;
  onCommand: (command: DeskCommand) => void;
}) {
  const socket = useRealtimeSocket();
  const handle = useRef(opts.onCommand);
  // the latest handler, so a request sees the patch as it is now
  useEffect(() => {
    handle.current = opts.onCommand;
  });
  const report = {
    deskId: thisDeskId(),
    name: opts.name,
    connected: opts.connected,
    channels: opts.channels,
    rooms: opts.rooms.map((room) => ({
      room,
      source: opts.sourceOf(room),
      status: opts.states[room]?.status ?? null,
      message: opts.states[room]?.message ?? null,
    })),
  };
  const payload = JSON.stringify(report);

  useEffect(() => {
    if (!socket || !opts.connected) return;
    const send = () => socket.emit('desk:state', JSON.parse(payload));
    send();
    const timer = setInterval(send, REPORT_MS);
    socket.on('connect', send); // back in its room after a reconnect
    return () => {
      clearInterval(timer);
      socket.off('connect', send);
    };
  }, [socket, payload, opts.connected]);

  useEffect(() => {
    if (!socket) return;
    const onCommand = (c: DeskCommand) => handle.current(c);
    socket.on('desk:command', onCommand);
    return () => void socket.off('desk:command', onCommand);
  }, [socket]);
}

/** Keeps the screen (and so the laptop) awake while `on`, re-asking when the tab comes back. */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [on]);
}

const DESKS_KEY = ['capture-desks'] as const;

/** On any other computer: the desks online now (not this one), refreshed every few seconds. */
export function useRemoteDesks() {
  const own = typeof window === 'undefined' ? '' : thisDeskId();
  return useQuery({
    queryKey: DESKS_KEY,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve<RemoteDesk[]>([]) : api.get<RemoteDesk[]>('/capture-desks', undefined, signal)),
    refetchInterval: 4000,
    select: (desks) => desks.filter((d) => d.deskId !== own),
  });
}

/** Asks a desk to patch, start or stop a room; the list refreshes as the desk reports back. */
export function useDeskCommand() {
  const client = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ deskId, ...body }: { deskId: string; action: 'patch' | 'start' | 'stop'; room: string; source?: string }) =>
      api.post<{ sent: string }>(`/capture-desks/${deskId}/command`, body),
    onMutate: (v) => setPending(`${v.deskId}|${v.room}`),
    onSettled: () => {
      // the desk reports its new state within a moment
      setTimeout(() => {
        setPending(null);
        void client.invalidateQueries({ queryKey: DESKS_KEY });
      }, 1500);
    },
  });
  return { ...mutation, pending };
}
