import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in socket.io socket: records handlers so the test can play server events. */
const fake = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>();
  const socket = {
    connected: false,
    active: false,
    auth: null as unknown,
    on: vi.fn((event: string, fn: (payload?: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: (payload?: unknown) => void) => handlers.get(event)?.delete(fn)),
    connect: vi.fn(() => {
      socket.active = true;
    }),
    disconnect: vi.fn(() => {
      socket.active = false;
      socket.connected = false;
    }),
    emit: (event: string, payload?: unknown) => handlers.get(event)?.forEach((fn) => fn(payload)),
  };
  return { socket, io: vi.fn((_url: string, opts: { auth: unknown }) => ((socket.auth = opts.auth), socket)) };
});
vi.mock('socket.io-client', () => ({ io: fake.io }));

const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ refreshSession: refresh }));
vi.mock('@/lib/api/tokens', () => ({ readTokens: () => ({ accessToken: 'access-1', refreshToken: 'r' }) }));

import { useRealtimeEvents } from '@/lib/api/realtime';

function Listener({ onStatus }: { onStatus: (payload: unknown) => void }) {
  useRealtimeEvents({ 'session:status': onStatus });
  return null;
}

beforeEach(() => {
  fake.socket.connect.mockClear();
  fake.socket.disconnect.mockClear();
  refresh.mockReset();
});
afterEach(cleanup);

describe('realtime', () => {
  it('connects to the API origin with the access token, and delivers events', () => {
    const onStatus = vi.fn();
    render(<Listener onStatus={onStatus} />);
    expect(fake.io).toHaveBeenCalledWith('http://localhost:3000', expect.objectContaining({ path: '/socket.io' }));
    const cb = vi.fn();
    (fake.socket.auth as (cb: (v: unknown) => void) => void)(cb);
    expect(cb).toHaveBeenCalledWith({ token: 'access-1' });
    expect(fake.socket.connect).toHaveBeenCalledOnce();

    act(() => fake.socket.emit('session:status', { sessionId: 's1', status: 'live' }));
    expect(onStatus).toHaveBeenCalledWith({ sessionId: 's1', status: 'live' });
  });

  it('disconnects when the last listener goes, and stops delivering', () => {
    const onStatus = vi.fn();
    const { unmount } = render(<Listener onStatus={onStatus} />);
    unmount();
    expect(fake.socket.disconnect).toHaveBeenCalled();
    fake.socket.emit('session:status', {});
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('refreshes the session and reconnects when the handshake is refused as unauthorized', async () => {
    refresh.mockResolvedValue('refreshed');
    render(<Listener onStatus={vi.fn()} />);
    fake.socket.connect.mockClear();
    fake.socket.active = false;
    await act(async () => {
      fake.socket.emit('connect_error', new Error('unauthorized'));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fake.socket.connect).toHaveBeenCalledOnce();
  });
});
