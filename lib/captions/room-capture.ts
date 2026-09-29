import type { Socket } from 'socket.io-client';

import { captureMimeType, sameRoom } from '@/lib/captions/captions';

export type RoomStatus = 'starting' | 'capturing' | 'waiting' | 'reconnecting' | 'error';
export type RoomState = { status: RoomStatus; message: string | null };

type Ack = { capturing?: string; diarise?: boolean; error?: string; message?: string };

/**
 * One room's captions from one channel of the sound desk: its own socket (the server ties a
 * capture to a connection), and a MediaRecorder sending WebM/Opus chunks every 250 ms.
 *
 * The server asks for a fresh recording (`capture:restart`) when its speech stream reopens, since
 * only a recording's first chunk carries the header it needs; after losing the room to another
 * server (`capture:lost`) or a reconnect, the room is announced again and recording restarts.
 * With no socket (demo mode) it records nothing and reports itself capturing.
 */
export class RoomCapture {
  private recorder: MediaRecorder | null = null;
  private stopped = false;
  private connectedOnce = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  /** Standing by: another source holds the room, so its restarts are not ours. */
  private waiting = false;

  /** How often a desk standing by asks for the room again. */
  static readonly STANDBY_RETRY_MS = 5_000;

  constructor(
    readonly room: string,
    private readonly diarise: boolean,
    private readonly audio: MediaStream,
    private readonly socket: Socket | null,
    private readonly onChange: (state: RoomState) => void,
  ) {}

  async start(): Promise<void> {
    this.onChange({ status: 'starting', message: null });
    if (!this.socket) {
      this.onChange({ status: 'capturing', message: null });
      return;
    }
    const s = this.socket;
    s.on('capture:restart', this.onRestart);
    s.on('capture:lost', this.onLost);
    s.on('connect', this.onConnect);
    s.on('disconnect', this.onDisconnect);
    s.connect();
    // The first connect announces the room; this only reports a server that never answers.
    setTimeout(() => {
      if (!this.connectedOnce && !this.stopped) this.onChange({ status: 'reconnecting', message: 'Cannot reach the server yet. Still trying.' });
    }, 10_000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearRetry();
    this.stopRecorder();
    const s = this.socket;
    if (!s) return;
    s.off('capture:restart', this.onRestart);
    s.off('capture:lost', this.onLost);
    s.off('connect', this.onConnect);
    s.off('disconnect', this.onDisconnect);
    if (s.connected) await s.timeout(5_000).emitWithAck('caption:stop').catch(() => undefined);
    s.disconnect();
  }

  private readonly onConnect = () => {
    this.connectedOnce = true;
    void this.announce();
  };

  private readonly onDisconnect = () => {
    if (this.stopped) return;
    this.clearRetry(); // the reconnect announces again
    this.stopRecorder();
    this.onChange({ status: 'reconnecting', message: 'Connection lost. Reconnecting; captions resume by themselves.' });
  };

  private readonly onRestart = (payload: { room: string }) => {
    if (this.stopped || this.waiting || !sameRoom(payload.room, this.room)) return;
    this.record();
    this.onChange({ status: 'capturing', message: null });
  };

  private readonly onLost = (payload: { room: string }) => {
    if (!this.stopped && sameRoom(payload.room, this.room)) void this.announce();
  };

  /** Claims the room on the server, then (unless another desk holds it) starts a fresh recording. */
  private async announce(): Promise<void> {
    const s = this.socket;
    if (!s || this.stopped) return;
    let ack: Ack;
    try {
      ack = (await s.timeout(10_000).emitWithAck('capture:start', { room: this.room, diarise: this.diarise })) as Ack;
    } catch {
      if (!this.stopped) this.onChange({ status: 'reconnecting', message: 'The server did not answer. Retrying.' });
      return;
    }
    if (this.stopped) return;
    if (ack.error === 'forbidden') {
      this.fail('Your account cannot run captions.');
      return;
    }
    if (ack.error === 'capture-busy') {
      // Standing by: no audio is sent (the venue uplink is thin), only a request for the room
      // every few seconds. When it is granted, recording starts fresh.
      this.waiting = true;
      this.stopRecorder();
      this.onChange({ status: 'waiting', message: ack.message ?? 'Another desk is capturing this room. This one takes over when it stops.' });
      this.clearRetry();
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.announce();
      }, RoomCapture.STANDBY_RETRY_MS);
      return;
    }
    this.waiting = false;
    this.clearRetry();
    this.record();
    this.onChange({ status: 'capturing', message: null });
  }

  private record() {
    const s = this.socket;
    if (!s || this.stopped) return;
    this.stopRecorder();
    const mimeType = captureMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) {
      this.fail('This browser cannot record WebM audio. Use Chrome or Edge.');
      return;
    }
    const rec = new MediaRecorder(this.audio, { mimeType, audioBitsPerSecond: 32_000 });
    rec.ondataavailable = async (event) => {
      if (event.data.size > 0 && this.recorder === rec && s.connected) s.emit('capture:audio', await event.data.arrayBuffer());
    };
    rec.start(250);
    this.recorder = rec;
  }

  private stopRecorder() {
    const rec = this.recorder;
    this.recorder = null; // before stop(), so its last chunk (without a fresh header) is not sent
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  private clearRetry() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }

  private fail(message: string) {
    void this.stop();
    this.onChange({ status: 'error', message });
  }
}
