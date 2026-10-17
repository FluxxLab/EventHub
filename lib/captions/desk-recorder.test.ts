import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

import { api, ApiError, NetworkError } from '@/lib/api/client';
import { DeskStore } from '@/lib/captions/desk-db';
import {
  afterFailure,
  afterOutcome,
  backoffMs,
  DeskBackup,
  flagOffline,
  MAX_REFUSALS,
  nextUpload,
  OVERLAP_MS,
  overlaps,
  PIECE_MS,
  pieceFilename,
  pieceLabel,
  pollJob,
  POLL_LIMIT_MS,
  recoverPieces,
  REPOLL_MS,
  RoomBackup,
  sendPiece,
  StorageError,
  type BackupPiece,
  type Clock,
} from '@/lib/captions/desk-recorder';

const post = vi.mocked(api.post);
const get = vi.mocked(api.get);

const piece = (over: Partial<BackupPiece> = {}): BackupPiece => ({
  id: 'p1',
  room: 'Main Hall',
  startedAt: 1_000,
  endedAt: 301_000,
  mimeType: 'audio/webm;codecs=opus',
  bytes: 1_200_000,
  status: 'pending',
  needsUpload: false,
  ...over,
});

/** A clock whose sleeps pass at once, moving time on. */
function fakeClock(start = 1_000_000): Clock & { at: number } {
  const clock = {
    at: start,
    now: () => clock.at,
    sleep: async (ms: number) => {
      clock.at += ms;
    },
  };
  return clock;
}

/** MediaRecorder stand-in: delivers chunks on demand, and its stop event when stopped. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  timeslice = 0;
  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string; audioBitsPerSecond: number },
  ) {
    FakeRecorder.instances.push(this);
  }
  start(timeslice: number) {
    this.timeslice = timeslice;
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
  deliver(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

beforeEach(() => {
  FakeRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  post.mockReset();
  get.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offline intervals', () => {
  it('finds a piece that shares any moment with an interval', () => {
    const p = piece({ startedAt: 100, endedAt: 200 });
    expect(overlaps(p, { from: 150, to: 160 }, 1_000)).toBe(true);
    expect(overlaps(p, { from: 50, to: 100 }, 1_000)).toBe(true);
    expect(overlaps(p, { from: 201, to: 300 }, 1_000)).toBe(false);
    expect(overlaps(p, { from: 10, to: 99 }, 1_000)).toBe(false);
    // still offline: the interval runs to now
    expect(overlaps(p, { from: 10, to: null }, 1_000)).toBe(true);
  });

  it('treats a piece still recording as running to now', () => {
    const p = piece({ startedAt: 100, endedAt: 120, status: 'recording' });
    expect(overlaps(p, { from: 500, to: 600 }, 1_000)).toBe(true);
    expect(overlaps(p, { from: 500, to: 600 }, 400)).toBe(false);
  });

  it('marks the room’s overlapping pieces only, and only once', () => {
    const pieces = [
      piece({ id: 'a', startedAt: 0, endedAt: 300 }),
      piece({ id: 'b', startedAt: 300, endedAt: 600 }),
      piece({ id: 'c', startedAt: 300, endedAt: 600, room: 'Hall A' }),
      piece({ id: 'd', startedAt: 0, endedAt: 300, needsUpload: true }),
      piece({ id: 'e', startedAt: 0, endedAt: 300, status: 'uploaded' }),
    ];
    const flagged = flagOffline(pieces, { 'Main Hall': [{ from: 250, to: 320 }] }, 1_000);
    expect(flagged.map((p) => p.id)).toEqual(['a', 'b']);
    expect(flagged.every((p) => p.needsUpload)).toBe(true);
  });
});

describe('upload queue', () => {
  it('waits 30 s after a failure, doubling to 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
  });

  it('takes the oldest finished piece marked to upload whose wait is over', () => {
    const pieces = [
      piece({ id: 'live', startedAt: 10, needsUpload: false }),
      piece({ id: 'recording', startedAt: 5, needsUpload: true, status: 'recording' }),
      piece({ id: 'later', startedAt: 30, needsUpload: true }),
      piece({ id: 'waiting', startedAt: 20, needsUpload: true, status: 'failed', retryAt: 5_000 }),
      piece({ id: 'given-up', startedAt: 1, needsUpload: true, status: 'failed' }),
      piece({ id: 'done', startedAt: 2, needsUpload: false, status: 'uploaded' }),
    ];
    expect(nextUpload(pieces, 1_000)?.id).toBe('later');
    expect(nextUpload(pieces, 5_000)?.id).toBe('waiting');
    expect(nextUpload([], 0)).toBeNull();
  });

  it('recovers pieces after a reload: recording ones are kept, cut-off uploads go again', () => {
    const changed = recoverPieces([
      piece({ id: 'rec', status: 'recording' }),
      piece({ id: 'cut', status: 'uploading' }),
      piece({ id: 'job', status: 'uploading', jobId: 'j1', retryAt: 99 }),
      piece({ id: 'ok', status: 'uploaded' }),
    ]);
    expect(changed).toEqual([piece({ id: 'rec', status: 'pending' }), piece({ id: 'cut', status: 'pending' }), piece({ id: 'job', status: 'uploading', jobId: 'j1', retryAt: 0 })]);
  });

  it('labels each state', () => {
    expect(pieceLabel(piece({ status: 'recording' })).text).toBe('Recording');
    expect(pieceLabel(piece({ needsUpload: true })).text).toBe('Waiting to upload');
    expect(pieceLabel(piece({ status: 'uploading' })).text).toBe('Uploading');
    expect(pieceLabel(piece({ status: 'uploaded', inserted: 12 })).text).toBe('Filled in 12 lines');
    expect(pieceLabel(piece({ status: 'uploaded', inserted: 0 })).text).toBe('Uploaded, nothing missing');
    expect(pieceLabel(piece({ status: 'failed', error: 'no connection', retryAt: 5 })).text).toBe('Failed: no connection — retrying');
    expect(pieceLabel(piece({ status: 'failed', error: 'too short' })).text).toBe('Failed: too short');
  });

  it('names a download after the room and its start time', () => {
    expect(pieceFilename('Main Hall', new Date(2026, 9, 17, 9, 5).getTime())).toBe('Main Hall-09-05.webm');
  });
});

describe('uploading a piece', () => {
  const ok = { ok: true, status: 200 } as Response;

  it('signs, PUTs to storage, starts the backfill and checks it until it completes', async () => {
    const clock = fakeClock(Date.UTC(2026, 9, 17, 10, 0));
    const fetchMock = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);
    post.mockResolvedValueOnce({ url: 'https://s3.example/put', key: 'backfill/k1' }).mockResolvedValueOnce({ jobId: 'job-1' });
    get.mockResolvedValueOnce({ state: 'active' }).mockResolvedValueOnce({ state: 'completed', inserted: 7 });
    const blob = new Blob([new Uint8Array(10)], { type: 'audio/webm' });
    const onJob = vi.fn();

    const p = piece({ startedAt: Date.UTC(2026, 9, 17, 9, 30), endedAt: Date.UTC(2026, 9, 17, 9, 35) });
    const outcome = await sendPiece(p, blob, onJob, clock);

    expect(post).toHaveBeenNthCalledWith(1, '/captions/backfill/upload-url', { room: 'Main Hall', contentType: 'audio/webm', bytes: 10 });
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example/put', { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: blob });
    expect(post).toHaveBeenNthCalledWith(2, '/captions/backfill', {
      room: 'Main Hall',
      key: 'backfill/k1',
      startedAt: '2026-10-17T09:30:00.000Z',
      durationMs: 300_000,
      deskNow: '2026-10-17T10:00:00.000Z',
    });
    expect(onJob).toHaveBeenCalledWith('job-1');
    expect(get).toHaveBeenCalledWith('/captions/backfill/job-1');
    expect(outcome).toEqual({ status: 'uploaded', inserted: 7 });
  });

  it('refuses when storage does', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    post.mockResolvedValueOnce({ url: 'u', key: 'k' });
    await expect(sendPiece(piece(), new Blob(), vi.fn(), fakeClock())).rejects.toBeInstanceOf(StorageError);
  });

  it('reports a failed job, and keeps asking through blips in the link', async () => {
    get.mockRejectedValueOnce(new NetworkError('offline', 'x')).mockResolvedValueOnce({ state: 'failed', error: 'no speech found' });
    expect(await pollJob('j', fakeClock())).toEqual({ status: 'failed', error: 'no speech found' });
  });

  it('stops checking after 10 minutes, leaving the job to check later', async () => {
    get.mockResolvedValue({ state: 'active' });
    const clock = fakeClock();
    const start = clock.at;
    expect(await pollJob('j', clock)).toEqual({ status: 'uploading', jobId: 'j' });
    expect(clock.at - start).toBe(POLL_LIMIT_MS);
  });

  it('moves the piece on after each answer', () => {
    const now = 1_000;
    expect(afterOutcome(piece({ status: 'uploading', needsUpload: true }), { status: 'uploaded', inserted: 3 }, now)).toMatchObject({ status: 'uploaded', inserted: 3, needsUpload: false });
    expect(afterOutcome(piece({ status: 'uploading' }), { status: 'uploading', jobId: 'j' }, now)).toEqual({ status: 'uploading', jobId: 'j', retryAt: now + REPOLL_MS });
    expect(afterOutcome(piece({ tries: 1, refusals: 1 }), { status: 'failed', error: 'bad audio' }, now)).toMatchObject({
      status: 'failed',
      error: 'bad audio',
      tries: 2,
      refusals: 2,
      retryAt: now + 60_000,
    });
  });

  it('retries a lost link without end, but stops after repeated refusals', () => {
    const lost = afterFailure(piece({ tries: 9, refusals: 0 }), new TypeError('Failed to fetch'), 0);
    expect(lost).toMatchObject({ status: 'failed', error: 'no connection', refusals: 0, retryAt: 300_000 });
    const refused = afterFailure(piece({ tries: 1, refusals: MAX_REFUSALS - 1 }), new ApiError(400, 'room unknown'), 0);
    expect(refused).toMatchObject({ status: 'failed', error: 'room unknown', retryAt: undefined });
  });
});

describe('RoomBackup', () => {
  it('records 5 s chunks at 32 kbps, and starts each new piece a second before the last stops', () => {
    vi.useFakeTimers();
    const begun: string[] = [];
    const ended: string[] = [];
    let n = 0;
    const backup = new RoomBackup('Main Hall', {} as MediaStream, 'audio/webm', {
      begin: () => {
        const p = piece({ id: `p${++n}` });
        begun.push(p.id);
        return p;
      },
      chunk: () => undefined,
      end: (id) => ended.push(id),
    });
    backup.start();
    const [first] = FakeRecorder.instances;
    expect(first).toMatchObject({ state: 'recording', timeslice: 5_000, options: { audioBitsPerSecond: 32_000 } });

    vi.advanceTimersByTime(PIECE_MS - OVERLAP_MS);
    expect(begun).toEqual(['p1', 'p2']);
    expect(first!.state).toBe('recording'); // both run for a moment
    vi.advanceTimersByTime(OVERLAP_MS);
    expect(first!.state).toBe('inactive');
    expect(ended).toEqual(['p1']);

    backup.stop();
    expect(FakeRecorder.instances[1]!.state).toBe('inactive');
    expect(ended).toEqual(['p1', 'p2']);
    vi.advanceTimersByTime(PIECE_MS * 2);
    expect(FakeRecorder.instances).toHaveLength(2); // nothing after the stop
  });
});

describe('DeskBackup', () => {
  /** A desk with storage in memory only (as where IndexedDB is missing). */
  const desk = (options: ConstructorParameters<typeof DeskBackup>[1] = {}) => new DeskBackup(new DeskStore(async () => null), { clock: fakeClock(), ...options });

  it('keeps pieces recorded while connected out of the upload, and marks those recorded offline', async () => {
    const d = desk();
    await d.ready;
    d.startRoom('Main Hall', {} as MediaStream);
    d.setRoomStatus('Main Hall', 'capturing');
    expect(d.getSnapshot().pieces[0]).toMatchObject({ status: 'recording', needsUpload: false });

    d.setRoomStatus('Main Hall', 'reconnecting');
    expect(d.getSnapshot().pieces[0]!.needsUpload).toBe(true);
    expect(d.getSnapshot().offline).toEqual(['Main Hall']);

    d.setRoomStatus('Main Hall', 'capturing');
    expect(d.getSnapshot().offline).toEqual([]);
    d.stopRoom('Main Hall');
  });

  it('records the audio, then uploads an offline piece once it has stopped, and keeps it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    post.mockResolvedValueOnce({ url: 'https://s3.example/put', key: 'k' }).mockResolvedValueOnce({ jobId: 'job-9' });
    get.mockResolvedValue({ state: 'completed', inserted: 4 });

    const d = desk();
    await d.ready;
    d.startRoom('Hall A', {} as MediaStream);
    d.setRoomStatus('Hall A', 'reconnecting');
    const rec = FakeRecorder.instances[0]!;
    rec.deliver(100);
    rec.deliver(50);
    expect(post).not.toHaveBeenCalled(); // never while still recording

    d.setRoomStatus('Hall A', 'capturing');
    d.stopRoom('Hall A');
    await vi.waitFor(() => expect(d.getSnapshot().pieces[0]!.status).toBe('uploaded'));
    const p = d.getSnapshot().pieces[0]!;
    expect(p).toMatchObject({ bytes: 150, inserted: 4, jobId: 'job-9', needsUpload: false });
    expect((fetchMock.mock.calls[0]![1] as { body: Blob }).body.size).toBe(150);
    expect((await d.blob(p.id)).size).toBe(150); // still here, the safety copy

    await d.remove(p.id);
    expect(d.getSnapshot().pieces).toHaveLength(0);
  });

  it('waits and retries when the link is down, and uploads nothing while offline', async () => {
    let online = true;
    const clock = fakeClock();
    post.mockRejectedValueOnce(new NetworkError('offline', 'x'));
    const d = desk({ clock, online: () => online });
    await d.ready;
    d.startRoom('Hall A', {} as MediaStream);
    d.setRoomStatus('Hall A', 'reconnecting');
    FakeRecorder.instances[0]!.deliver(10);
    d.stopRoom('Hall A');
    await vi.waitFor(() => expect(d.getSnapshot().pieces[0]!.status).toBe('failed'));
    expect(d.getSnapshot().pieces[0]).toMatchObject({ error: 'no connection', retryAt: clock.at + 30_000 });

    online = false;
    clock.at += 60_000;
    d.kick();
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('fakes the upload in demo mode', async () => {
    const d = desk({ demo: true });
    await d.ready;
    d.startRoom('Main Hall', {} as MediaStream);
    FakeRecorder.instances[0]!.deliver(10);
    d.stopRoom('Main Hall');
    await vi.waitFor(() => expect(d.getSnapshot().pieces[0]!.status).toBe('pending'));
    d.uploadAll(d.getSnapshot().pieces.map((p) => p.id));
    await vi.waitFor(() => expect(d.getSnapshot().pieces[0]).toMatchObject({ status: 'uploaded', inserted: 0 }));
    expect(post).not.toHaveBeenCalled();
  });
});
