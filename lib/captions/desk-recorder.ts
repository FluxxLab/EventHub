'use client';

import { useSyncExternalStore } from 'react';

import { api, ApiError } from '@/lib/api/client';
import { captureMimeType } from '@/lib/captions/captions';
import { DeskStore } from '@/lib/captions/desk-db';
import type { RoomStatus } from '@/lib/captions/room-capture';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Backup recordings on the sound desk. The venue's link drops for minutes at a time, and speech
 * sent while it is down is lost. So each room the desk captures is also recorded here, mono
 * WebM/Opus at 32 kbps, in self-contained five-minute pieces written to IndexedDB every 5 s.
 * Pieces recorded while a room was offline are uploaded when the link returns, and the server
 * transcribes them and fills in the captions that were missed (only what is missing).
 */

export type PieceStatus = 'recording' | 'pending' | 'uploading' | 'uploaded' | 'failed';

export type BackupPiece = {
  id: string;
  room: string;
  /** When its recorder started (ms since epoch). */
  startedAt: number;
  /** When it stopped; while recording, the time of its latest chunk. */
  endedAt: number;
  mimeType: string;
  bytes: number;
  status: PieceStatus;
  /** Overlaps a time the room was offline (or the operator asked): upload it. */
  needsUpload: boolean;
  jobId?: string;
  error?: string;
  /** Caption lines the server added from it. */
  inserted?: number;
  /** Failed attempts so far, which set the wait before the next. */
  tries?: number;
  /** Failures the server answered (not a lost link); after a few, it waits for the operator. */
  refusals?: number;
  /** When to try (or check on the server) again; unset on a failed piece: only by hand. */
  retryAt?: number;
};

/** A time a room had no link to the caption service; `to` is null while it lasts. */
export type OfflineInterval = { from: number; to: number | null };

export const PIECE_MS = 5 * 60_000;
/** The next piece starts this long before the last stops, so no word falls between them. */
export const OVERLAP_MS = 1_000;
export const TIMESLICE_MS = 5_000;
export const BACKUP_BITS = 32_000;
export const POLL_MS = 5_000;
/** Checking on a server job stops after this; it is checked again a minute later. */
export const POLL_LIMIT_MS = 10 * 60_000;
export const REPOLL_MS = 60_000;
export const RETRY_MIN_MS = 30_000;
export const RETRY_MAX_MS = 5 * 60_000;
export const MAX_REFUSALS = 5;

/* -------------------------------------------------------------- pure logic */

/** Where a piece ends for overlap checks: now, while it is still recording. */
const pieceEnd = (piece: BackupPiece, now: number) => (piece.status === 'recording' ? now : piece.endedAt);

export const pieceDuration = (piece: BackupPiece, now: number) => Math.max(0, pieceEnd(piece, now) - piece.startedAt);

/** Whether a piece and an offline interval share any moment. */
export const overlaps = (piece: BackupPiece, interval: OfflineInterval, now: number) => piece.startedAt <= (interval.to ?? now) && interval.from <= pieceEnd(piece, now);

/** The pieces that overlap their room's offline intervals and are not yet marked, now marked to upload. */
export function flagOffline(pieces: BackupPiece[], offline: Record<string, OfflineInterval[]>, now: number): BackupPiece[] {
  return pieces.filter((p) => !p.needsUpload && p.status !== 'uploaded' && (offline[p.room] ?? []).some((i) => overlaps(p, i, now))).map((p) => ({ ...p, needsUpload: true }));
}

/** The wait after a failed attempt: 30 s, doubling to 5 min. */
export const backoffMs = (tries: number) => Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.max(0, tries - 1));

/** The next piece to upload: the oldest finished one marked to upload whose wait is over. */
export function nextUpload(pieces: BackupPiece[], now: number): BackupPiece | null {
  const due = pieces.filter((p) => p.needsUpload && (p.status === 'pending' || (p.status === 'failed' && p.retryAt !== undefined)) && (p.retryAt ?? 0) <= now);
  return due.sort((a, b) => a.startedAt - b.startedAt)[0] ?? null;
}

/** A piece the server is still working on, due to be checked again. */
export const nextRecheck = (pieces: BackupPiece[], now: number) =>
  pieces.filter((p) => p.status === 'uploading' && p.jobId && (p.retryAt ?? 0) <= now).sort((a, b) => a.startedAt - b.startedAt)[0] ?? null;

/**
 * Pieces as found after a reload or crash: one still recording is kept as it stands (its chunks
 * from the first, with the header, decode as WebM), and an upload cut off before the server took it
 * is tried again. Returns only the pieces that changed.
 */
export function recoverPieces(pieces: BackupPiece[]): BackupPiece[] {
  return pieces.flatMap((p): BackupPiece[] => {
    if (p.status === 'recording') return [{ ...p, status: 'pending' }];
    if (p.status === 'uploading' && !p.jobId) return [{ ...p, status: 'pending' }];
    if (p.status === 'uploading') return [{ ...p, retryAt: 0 }];
    return [];
  });
}

/** How a piece reads in the list, and its tag's tone. */
export function pieceLabel(piece: BackupPiece): { text: string; tone: 'gray' | 'primary' | 'green' | 'danger' | 'gold' } {
  switch (piece.status) {
    case 'recording':
      return { text: 'Recording', tone: 'danger' };
    case 'uploading':
      return { text: 'Uploading', tone: 'primary' };
    case 'uploaded':
      return piece.inserted ? { text: `Filled in ${piece.inserted} ${piece.inserted === 1 ? 'line' : 'lines'}`, tone: 'green' } : { text: 'Uploaded, nothing missing', tone: 'green' };
    case 'failed':
      return { text: `Failed: ${piece.error ?? 'unknown reason'}${piece.retryAt !== undefined ? ' — retrying' : ''}`, tone: 'danger' };
    default:
      return piece.needsUpload ? { text: 'Waiting to upload', tone: 'gold' } : { text: 'Saved', tone: 'gray' };
  }
}

const two = (n: number) => String(n).padStart(2, '0');

/** "Main Hall-09-30.webm": the room and the local time the piece started. */
export const pieceFilename = (room: string, startedAt: number) => {
  const at = new Date(startedAt);
  return `${room.replace(/[\\/:*?"<>|]+/g, '-')}-${two(at.getHours())}-${two(at.getMinutes())}.webm`;
};

/** Whether a time falls on the same local day as `now`. */
export const sameDay = (at: number, now: number) => new Date(at).toDateString() === new Date(now).toDateString();

/* -------------------------------------------------------------- uploading */

/** Storage refused the PUT (the server answered, so this is not a lost link). */
export class StorageError extends Error {}

export type BackfillJob = { state: string; inserted?: number; error?: string };
export type UploadOutcome = { status: 'uploaded'; inserted: number } | { status: 'failed'; error: string } | { status: 'uploading'; jobId: string };

export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Checks on a backfill job every 5 s until it ends; after 10 min it is left 'uploading' to check later. */
export async function pollJob(jobId: string, clock: Clock = realClock): Promise<UploadOutcome> {
  const until = clock.now() + POLL_LIMIT_MS;
  while (clock.now() < until) {
    await clock.sleep(POLL_MS);
    let job: BackfillJob;
    try {
      job = await api.get<BackfillJob>(`/captions/backfill/${jobId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { status: 'failed', error: 'the server lost the job' };
      continue; // a blip in the link: ask again
    }
    if (job.state === 'completed') return { status: 'uploaded', inserted: job.inserted ?? 0 };
    if (job.state === 'failed') return { status: 'failed', error: job.error || 'the caption service could not read it' };
  }
  return { status: 'uploading', jobId };
}

/**
 * Uploads one piece: a signed address from the API, the audio PUT straight to storage, then the
 * backfill job, checked until it ends. `onJob` hears the job id as soon as there is one.
 */
export async function sendPiece(piece: BackupPiece, blob: Blob, onJob: (jobId: string) => void, clock: Clock = realClock): Promise<UploadOutcome> {
  const { url, key } = await api.post<{ url: string; key: string }>('/captions/backfill/upload-url', { room: piece.room, contentType: 'audio/webm', bytes: blob.size });
  // straight to storage: the signed address is the permission, so no auth header
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: blob });
  if (!put.ok) throw new StorageError(`storage refused it (${put.status})`);
  const { jobId } = await api.post<{ jobId: string }>('/captions/backfill', {
    room: piece.room,
    key,
    startedAt: new Date(piece.startedAt).toISOString(),
    durationMs: piece.endedAt - piece.startedAt,
    deskNow: new Date(clock.now()).toISOString(),
  });
  onJob(jobId);
  return pollJob(jobId, clock);
}

/** The piece after an attempt ends in an error: a lost link waits and retries without end; a refusal counts. */
export function afterFailure(piece: BackupPiece, error: unknown, now: number): Partial<BackupPiece> {
  const refused = error instanceof ApiError || error instanceof StorageError;
  const tries = (piece.tries ?? 0) + 1;
  const refusals = (piece.refusals ?? 0) + (refused ? 1 : 0);
  const message = error instanceof ApiError || error instanceof StorageError ? error.message : 'no connection';
  return { status: 'failed', jobId: undefined, error: message, tries, refusals, retryAt: refusals >= MAX_REFUSALS ? undefined : now + backoffMs(tries) };
}

/** The piece after the server's answer. */
export function afterOutcome(piece: BackupPiece, outcome: UploadOutcome, now: number): Partial<BackupPiece> {
  if (outcome.status === 'uploaded') return { status: 'uploaded', inserted: outcome.inserted, needsUpload: false, error: undefined, tries: 0, refusals: 0, retryAt: undefined };
  if (outcome.status === 'uploading') return { status: 'uploading', jobId: outcome.jobId, retryAt: now + REPOLL_MS };
  const tries = (piece.tries ?? 0) + 1;
  const refusals = (piece.refusals ?? 0) + 1;
  return { status: 'failed', jobId: undefined, error: outcome.error, tries, refusals, retryAt: refusals >= MAX_REFUSALS ? undefined : now + backoffMs(tries) };
}

/* -------------------------------------------------------------- recording */

type Hooks = {
  begin: (room: string, mimeType: string) => BackupPiece;
  chunk: (pieceId: string, index: number, blob: Blob) => void;
  end: (pieceId: string) => void;
};

/**
 * One room's backup: a MediaRecorder on the room's mono stream, chunks every 5 s. Every five
 * minutes a new recorder starts, and the old one stops a second later, so each piece stands
 * alone (its own header) and no speech falls between two.
 */
export class RoomBackup {
  private current: MediaRecorder | null = null;
  private retiring = new Set<MediaRecorder>();
  private rotate: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    readonly room: string,
    private readonly stream: MediaStream,
    private readonly mimeType: string,
    private readonly hooks: Hooks,
  ) {}

  start() {
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.rotate) clearTimeout(this.rotate);
    this.rotate = null;
    [this.current, ...this.retiring].forEach((rec) => rec && rec.state !== 'inactive' && rec.stop());
    this.current = null;
    this.retiring.clear();
  }

  private open() {
    if (this.stopped) return;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, { mimeType: this.mimeType, audioBitsPerSecond: BACKUP_BITS });
    } catch {
      return; // the room still captions; there is just no backup
    }
    const piece = this.hooks.begin(this.room, this.mimeType);
    let index = 0;
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) this.hooks.chunk(piece.id, index++, event.data);
    };
    rec.onstop = () => this.hooks.end(piece.id);
    rec.start(TIMESLICE_MS);
    const old = this.current;
    this.current = rec;
    if (old) {
      this.retiring.add(old);
      setTimeout(() => {
        this.retiring.delete(old);
        if (old.state !== 'inactive') old.stop();
      }, OVERLAP_MS);
    }
    this.rotate = setTimeout(() => this.open(), PIECE_MS - OVERLAP_MS);
  }
}

export type BackupSnapshot = {
  pieces: BackupPiece[];
  /** Rooms being recorded now. */
  rooms: string[];
  /** Of those, the rooms without a link to the caption service. */
  offline: string[];
  /** Whether recordings outlive a reload (IndexedDB works here). */
  durable: boolean;
};

const EMPTY: BackupSnapshot = { pieces: [], rooms: [], offline: [], durable: true };

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Every room's backup, the pieces on this computer and the upload queue. One per page (see
 * `deskBackup`), so uploads carry on while the operator moves around the console.
 */
export class DeskBackup {
  private readonly pieces = new Map<string, BackupPiece>();
  private readonly recorders = new Map<string, RoomBackup>();
  private readonly status = new Map<string, RoomStatus>();
  private readonly offline: Record<string, OfflineInterval[]> = {};
  private readonly writes = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: BackupSnapshot = EMPTY;
  private durable = true;
  private pumping = false;
  private sending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private asked = false;
  readonly ready: Promise<void>;

  constructor(
    private readonly store: DeskStore,
    private readonly options: { demo?: boolean; clock?: Clock; online?: () => boolean } = {},
  ) {
    this.ready = this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onNetwork);
      window.addEventListener('offline', this.onNetwork);
    }
  }

  private get clock() {
    return this.options.clock ?? realClock;
  }

  private isOnline() {
    if (this.options.online) return this.options.online();
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  private async load() {
    this.durable = await this.store.durable();
    const stored = await this.store.listPieces();
    stored.forEach((p) => this.pieces.set(p.id, p));
    recoverPieces(stored).forEach((p) => this.save(p));
    this.emit();
    this.kick();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    const rooms = [...this.recorders.keys()];
    this.snapshot = {
      pieces: [...this.pieces.values()].sort((a, b) => a.startedAt - b.startedAt),
      rooms,
      offline: rooms.filter((r) => this.roomOffline(r)),
      durable: this.durable,
    };
    this.listeners.forEach((fn) => fn());
  }

  /** Keeps a piece's new state, here and on disk. */
  private save(piece: BackupPiece) {
    this.pieces.set(piece.id, piece);
    void this.store.putPiece(piece);
  }

  private change(id: string, change: Partial<BackupPiece>) {
    const piece = this.pieces.get(id);
    if (!piece) return null;
    const next = { ...piece, ...change };
    this.save(next);
    this.emit();
    return next;
  }

  /* ------------------------------------------------ rooms and offline time */

  /** Starts recording a room's mono stream (does nothing where the browser cannot record WebM). */
  startRoom(room: string, stream: MediaStream) {
    if (this.recorders.has(room) || typeof MediaRecorder === 'undefined') return;
    const mimeType = captureMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return;
    this.askToKeep();
    const backup = new RoomBackup(room, stream, mimeType, { begin: this.begin, chunk: this.chunk, end: this.end });
    this.recorders.set(room, backup);
    this.status.set(room, 'starting');
    backup.start();
    this.emit();
  }

  stopRoom(room: string) {
    const backup = this.recorders.get(room);
    if (!backup) return;
    this.recorders.delete(room);
    this.status.delete(room);
    this.track(room, false);
    backup.stop();
    this.emit();
  }

  /** The room's capture state, from its RoomCapture: 'reconnecting' is time offline. */
  setRoomStatus(room: string, status: RoomStatus) {
    if (!this.recorders.has(room)) return;
    this.status.set(room, status);
    this.track(room, this.roomOffline(room));
    this.emit();
  }

  private roomOffline(room: string) {
    return !this.isOnline() || this.status.get(room) === 'reconnecting';
  }

  private readonly onNetwork = () => {
    this.recorders.forEach((_, room) => this.track(room, this.roomOffline(room)));
    this.emit();
    this.kick();
  };

  /** Opens or closes the room's offline interval, and marks the pieces it touches. */
  private track(room: string, offline: boolean) {
    const now = this.clock.now();
    const list = (this.offline[room] ??= []);
    const open = list.find((i) => i.to === null);
    if (offline && !open) list.push({ from: now, to: null });
    if (!offline && open) open.to = now;
    // closed intervals no piece still recording can reach are done with
    this.offline[room] = list.filter((i) => i.to === null || i.to > now - 2 * PIECE_MS);
    const flagged = flagOffline([...this.pieces.values()], this.offline, now);
    flagged.forEach((p) => this.save(p));
    if (flagged.length) this.kick();
  }

  private readonly begin = (room: string, mimeType: string): BackupPiece => {
    const now = this.clock.now();
    const piece: BackupPiece = { id: newId(), room, startedAt: now, endedAt: now, mimeType, bytes: 0, status: 'recording', needsUpload: this.roomOffline(room) };
    this.save(piece);
    this.emit();
    return piece;
  };

  private readonly chunk = (pieceId: string, index: number, blob: Blob) => {
    const piece = this.pieces.get(pieceId);
    if (!piece) return;
    const next = { ...piece, bytes: piece.bytes + blob.size, endedAt: piece.status === 'recording' ? this.clock.now() : piece.endedAt };
    this.pieces.set(pieceId, next);
    // in order, so the record never claims chunks that are not on disk yet
    const write = (this.writes.get(pieceId) ?? Promise.resolve()).then(async () => {
      await this.store.putChunk(pieceId, index, blob);
      const latest = this.pieces.get(pieceId);
      if (latest) await this.store.putPiece(latest);
    });
    this.writes.set(pieceId, write);
    this.emit();
  };

  private readonly end = (pieceId: string) => {
    const endedAt = this.clock.now();
    const piece = this.pieces.get(pieceId);
    if (piece) this.pieces.set(pieceId, { ...piece, endedAt });
    // the last chunk arrives just before the stop: finish once every write is done
    void (this.writes.get(pieceId) ?? Promise.resolve()).then(() => {
      this.writes.delete(pieceId);
      const latest = this.pieces.get(pieceId);
      if (!latest || latest.status !== 'recording') return;
      this.save({ ...latest, status: 'pending' });
      this.emit();
      this.kick();
    });
  };

  /** Asks the browser not to clear the recordings when space runs short. */
  private askToKeep() {
    if (this.asked) return;
    this.asked = true;
    try {
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch {
      // kept on a best-effort basis
    }
  }

  /* ------------------------------------------------ the operator's actions */

  /** A piece's audio as one WebM file. */
  async blob(id: string): Promise<Blob> {
    await this.writes.get(id);
    return new Blob(await this.store.chunks(id), { type: 'audio/webm' });
  }

  /** Uploads a piece as soon as it can (straight away unless another is going). */
  uploadNow(id: string) {
    const piece = this.pieces.get(id);
    if (!piece || piece.status === 'uploading') return;
    this.change(id, { needsUpload: true, status: piece.status === 'recording' ? 'recording' : 'pending', error: undefined, tries: 0, refusals: 0, retryAt: undefined, jobId: undefined });
    this.kick();
  }

  /** Marks every finished piece among `ids` to upload: a full check after the session. */
  uploadAll(ids: string[]) {
    ids.forEach((id) => {
      const p = this.pieces.get(id);
      if (p && p.status !== 'recording' && p.status !== 'uploading' && p.status !== 'uploaded')
        this.save({ ...p, needsUpload: true, status: 'pending', error: undefined, tries: 0, refusals: 0, retryAt: undefined });
    });
    this.emit();
    this.kick();
  }

  async remove(id: string) {
    const piece = this.pieces.get(id);
    if (!piece || piece.status === 'recording' || this.sending === id) return;
    this.pieces.delete(id);
    this.emit();
    await this.store.deletePiece(id);
  }

  /* ------------------------------------------------ the upload queue */

  /** Starts the queue if it is idle. */
  kick() {
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (!this.options.demo && !this.isOnline()) break;
        const all = [...this.pieces.values()];
        const now = this.clock.now();
        const next = nextRecheck(all, now) ?? nextUpload(all, now);
        if (!next) break;
        // the link is down: the rest wait for the next try rather than failing one by one
        if ((await this.send(next)) === 'no-link') break;
      }
    } finally {
      this.pumping = false;
      this.schedule();
    }
  }

  /** Wakes the queue when the next wait is over. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const waits = [...this.pieces.values()]
      .filter((p) => p.needsUpload && p.retryAt !== undefined && (p.status === 'failed' || p.status === 'pending' || p.status === 'uploading'))
      .map((p) => p.retryAt!);
    if (waits.length === 0) return;
    const delay = Math.max(1_000, Math.min(...waits) - this.clock.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, delay);
  }

  private async send(piece: BackupPiece): Promise<'done' | 'no-link'> {
    this.sending = piece.id;
    const working = this.change(piece.id, { status: 'uploading', error: undefined, retryAt: undefined }) ?? piece;
    try {
      let outcome: UploadOutcome;
      if (this.options.demo) {
        await this.clock.sleep(1_500);
        outcome = { status: 'uploaded', inserted: 0 };
      } else if (working.jobId) {
        outcome = await pollJob(working.jobId, this.clock);
      } else {
        const blob = await this.blob(piece.id);
        outcome = await sendPiece(working, blob, (jobId) => this.change(piece.id, { jobId }), this.clock);
      }
      const latest = this.pieces.get(piece.id);
      if (latest) this.change(piece.id, afterOutcome(latest, outcome, this.clock.now()));
      return 'done';
    } catch (e) {
      const latest = this.pieces.get(piece.id);
      if (latest) this.change(piece.id, afterFailure(latest, e, this.clock.now()));
      return e instanceof ApiError || e instanceof StorageError ? 'done' : 'no-link';
    } finally {
      this.sending = null;
    }
  }
}

let shared: DeskBackup | null = null;

/** The page's one backup recorder (created on first use, in the browser only). */
export function deskBackup(): DeskBackup | null {
  if (typeof window === 'undefined') return null;
  shared ??= new DeskBackup(new DeskStore(), { demo: DEMO_MODE });
  return shared;
}

const noop = () => () => undefined;

/** The backup's pieces and rooms, updated as they change. */
export function useDeskBackup(): BackupSnapshot {
  return useSyncExternalStore(
    (fn) => deskBackup()?.subscribe(fn) ?? noop(),
    () => deskBackup()?.getSnapshot() ?? EMPTY,
    () => EMPTY,
  );
}
