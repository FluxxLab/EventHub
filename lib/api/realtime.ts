'use client';

import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { refreshSession } from '@/lib/api/client';
import { readTokens } from '@/lib/api/tokens';
import { API_URL } from '@/lib/config';
import { DEMO_MODE } from '@/lib/demo';

/**
 * The console's live connection to the API's socket.io server: one shared socket, opened while
 * any component listens and closed when none does. It carries the access token in the handshake
 * (`auth.token`, read fresh on every attempt), and when the server refuses it as unauthorized it
 * refreshes the session once and reconnects, since socket.io does not retry a refused handshake.
 *
 * It only listens to broadcast events. It never joins session rooms: joining counts the console
 * as a viewer and, for live sessions, records attendance.
 */

export type RealtimeStatus = 'connecting' | 'live' | 'offline' | 'demo';

let socket: Socket | null = null;
let users = 0;
let status: RealtimeStatus = DEMO_MODE ? 'demo' : 'offline';
const statusListeners = new Set<() => void>();
const setStatus = (next: RealtimeStatus) => {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener());
};

// The API is served at `<origin>/api/v1`; socket.io listens at `<origin>/socket.io`.
const connectTo = (forceNew: boolean) =>
  io(new URL(API_URL).origin, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    forceNew,
    auth: (cb) => cb({ token: readTokens()?.accessToken }),
  });

/**
 * A socket of its own, for one room's audio at the sound desk: the server ties a capture to its
 * connection, so each room needs one. The caller connects and disconnects it; like the shared
 * socket, it refreshes the session once when the handshake is refused as unauthorized.
 */
export function openCaptureSocket(): Socket {
  const s = connectTo(true);
  s.on('connect_error', (error) => {
    if (error.message === 'unauthorized') void refreshSession().then((result) => result === 'refreshed' && s.connect());
  });
  return s;
}

function open(): Socket {
  if (socket) return socket;
  socket = connectTo(false);
  socket.on('connect', () => setStatus('live'));
  socket.on('disconnect', () => setStatus(socket?.active ? 'connecting' : 'offline'));
  socket.on('connect_error', (error) => {
    if (error.message !== 'unauthorized') {
      setStatus(socket?.active ? 'connecting' : 'offline'); // network trouble: socket.io keeps retrying
      return;
    }
    setStatus('connecting');
    void refreshSession().then((result) => {
      if (result === 'refreshed' && users > 0) socket?.connect();
      else setStatus('offline');
    });
  });
  return socket;
}

function acquire(): Socket | null {
  if (DEMO_MODE) return null;
  const s = open();
  users += 1;
  if (!s.connected && !s.active) {
    setStatus('connecting');
    s.connect();
  }
  return s;
}

function release() {
  if (DEMO_MODE || !socket) return;
  users = Math.max(0, users - 1);
  if (users === 0) {
    socket.disconnect();
    setStatus('offline');
  }
}

/**
 * The shared socket for pages that send as well as listen (the capture desk), held open while the
 * component is mounted. Null in demo mode.
 */
export function useRealtimeSocket(): Socket | null {
  const ref = useRef<Socket | null>(null);
  useEffect(() => {
    ref.current = acquire();
    return () => {
      ref.current = null;
      release();
    };
  }, []);
  // The socket is a module singleton, so reading it directly is stable across renders.
  return DEMO_MODE ? null : open();
}

/** Connection state, for an indicator. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => status,
    () => 'offline',
  );
}

/**
 * Calls the given handlers for these server events while the component is mounted. The handlers
 * may change between renders without re-subscribing (the latest are always called).
 */
export function useRealtimeEvents(handlers: Record<string, (payload: unknown) => void>) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const events = Object.keys(handlers).sort().join('|');

  useEffect(() => {
    const s = acquire();
    if (!s) return;
    const names = events.split('|').filter(Boolean);
    const bound = names.map((name) => [name, (payload: unknown) => latest.current[name]?.(payload)] as const);
    bound.forEach(([name, fn]) => s.on(name, fn));
    return () => {
      bound.forEach(([name, fn]) => s.off(name, fn));
      release();
    };
  }, [events]);
}
