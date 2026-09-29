import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomCapture, type RoomState } from '@/lib/captions/room-capture';

type Ack = { capturing?: string; error?: string; message?: string };

/** A stand-in socket.io socket: the test plays server events and answers acks. */
function fakeSocket() {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>();
  const acks: Ack[] = [];
  const sent: { event: string; payload: unknown }[] = [];
  const socket = {
    connected: false,
    on: vi.fn((event: string, fn: (payload?: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: (payload?: unknown) => void) => handlers.get(event)?.delete(fn)),
    connect: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    emit: vi.fn((event: string, payload?: unknown) => sent.push({ event, payload })),
    timeout: () => ({
      emitWithAck: vi.fn((event: string, payload?: unknown) => {
        sent.push({ event, payload });
        return Promise.resolve(acks.shift() ?? { capturing: 'room' });
      }),
    }),
  };
  /** Server side: fire an event at the desk. */
  const serve = (event: string, payload?: unknown) => handlers.get(event)?.forEach((fn) => fn(payload));
  const up = () => {
    socket.connected = true;
    serve('connect');
  };
  return { socket, serve, up, acks, sent, starts: () => sent.filter((s) => s.event === 'capture:start').length };
}

/** MediaRecorder stand-in: records which instances started, stopped and what they delivered. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string },
  ) {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
  deliver(bytes: number[]) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('RoomCapture', () => {
  let states: RoomState[];
  const last = () => states.at(-1)!;

  beforeEach(() => {
    states = [];
    FakeRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const start = async (f = fakeSocket()) => {
    const capture = new RoomCapture('Main Hall', false, {} as MediaStream, f.socket as never, (s) => states.push(s));
    await capture.start();
    f.up();
    await flush();
    return { capture, f };
  };

  it('announces the room on connect, then records and streams its audio', async () => {
    const { f } = await start();
    expect(f.sent[0]).toEqual({ event: 'capture:start', payload: { room: 'Main Hall', diarise: false } });
    expect(last().status).toBe('capturing');
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(FakeRecorder.instances[0]!.options.mimeType).toBe('audio/webm;codecs=opus');

    FakeRecorder.instances[0]!.deliver([1, 2, 3]);
    await vi.waitFor(() => expect(f.sent.some((s) => s.event === 'capture:audio')).toBe(true));
  });

  it('stands by without recording while the room is held elsewhere, asking again every 5 s', async () => {
    vi.useFakeTimers();
    const f = fakeSocket();
    f.acks.push({ error: 'capture-busy', message: 'captioned from the venue stream' });
    await start(f);
    expect(last()).toEqual({ status: 'waiting', message: 'captioned from the venue stream' });
    expect(FakeRecorder.instances).toHaveLength(0); // nothing uploaded while standing by

    // someone else's restart is not ours to act on
    f.serve('capture:restart', { room: 'Main Hall' });
    expect(FakeRecorder.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(RoomCapture.STANDBY_RETRY_MS);
    expect(f.starts()).toBe(2);
    expect(last().status).toBe('capturing');
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  it('starts a fresh recording when the server asks, for its own room only', async () => {
    const { f } = await start();
    f.serve('capture:restart', { room: 'Hall A' });
    expect(FakeRecorder.instances).toHaveLength(1);
    f.serve('capture:restart', { room: ' main hall ' });
    expect(FakeRecorder.instances).toHaveLength(2);
    expect(FakeRecorder.instances[0]!.state).toBe('inactive');
    expect(FakeRecorder.instances[1]!.state).toBe('recording');
  });

  it('announces again after losing the room or reconnecting', async () => {
    const { f } = await start();
    f.serve('capture:lost', { room: 'Main Hall' });
    await flush();
    expect(f.starts()).toBe(2);

    f.socket.connected = false;
    f.serve('disconnect');
    expect(last().status).toBe('reconnecting');
    f.up();
    await flush();
    expect(f.starts()).toBe(3);
    expect(last().status).toBe('capturing');
  });

  it('stops with an error when the account may not caption', async () => {
    const f = fakeSocket();
    f.acks.push({ error: 'forbidden' });
    await start(f);
    await flush();
    expect(last().status).toBe('error');
    expect(f.socket.disconnect).toHaveBeenCalled();
  });

  it('tells the server it stopped, then lets go of the socket', async () => {
    const { capture, f } = await start();
    await capture.stop();
    expect(f.sent.at(-1)!.event).toBe('caption:stop');
    expect(f.socket.disconnect).toHaveBeenCalled();
    expect(FakeRecorder.instances[0]!.state).toBe('inactive');
  });
});
