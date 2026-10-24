import { api } from '@/lib/api/client';

/** What the server takes, by file extension (browsers often give .m4a no type). */
const TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
};

export function contentTypeOf(file: { name: string; type: string }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? (Object.values(TYPES).includes(file.type) ? file.type : null);
}

/** The command that fetches a stream's audio on a laptop, and prints when the stream started (UTC). */
export function ytDlpCommand(link: string): string {
  const url = link.trim() || 'PASTE-YOUTUBE-LINK';
  // the start as a plain number of seconds: no time zone to get wrong
  return `yt-dlp -f "bestaudio[ext=m4a]/bestaudio" -o "%(title)s.%(ext)s" --print "after_move:Started %(release_timestamp,timestamp)s | %(filepath)s" "${url}"`;
}

/**
 * When the stream started, as an instant: the number the command prints (seconds since 1970), or a
 * date and time ("2026-10-21 08:47:12") in UTC or Abuja (UTC+1). Null when unreadable.
 */
export function startInstant(text: string, zone: 'utc' | 'abuja'): string | null {
  const seconds = /^\d{9,11}$/.exec(text.trim());
  if (seconds) return new Date(Number(seconds[0]) * 1000).toISOString();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]!.padStart(2, '0')}:${m[3]}:${m[4] ?? '00'}${zone === 'utc' ? 'Z' : '+01:00'}`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** A media file's length, read by the browser; null when it cannot tell. */
export function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
    el.preload = 'metadata';
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

export type RecaptionResult = {
  inserted: number;
  skipped: number;
  sessions: { id: string; title: string; inserted: number }[];
  /** How far the server corrected the start time from the live captions, ms; null when it could not check. */
  shiftedMs?: number | null;
  /** Lines from an earlier, misplaced run of the same recording that were removed. */
  staleRemoved?: number;
};

/** "6 h 29 min later", for a correction worth mentioning (over a minute), else null. */
export function shiftText(ms: number | null | undefined): string | null {
  if (ms == null || Math.abs(ms) < 60_000) return null;
  const mins = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h} h ` : ''}${m ? `${m} min` : ''}`.trim() + (ms > 0 ? ' later' : ' earlier');
}

/**
 * Sends a stream's recording to be transcribed in place of the room's live captions over its hours:
 * a signed address, the file straight to storage (with progress), then the job, checked until done.
 */
export async function recaption(
  input: { room: string; file: File; contentType: string; startedAt: string; durationMs: number },
  onStage: (stage: { kind: 'uploading'; percent: number } | { kind: 'transcribing' }) => void,
): Promise<RecaptionResult> {
  const { url, key } = await api.post<{ url: string; key: string }>('/captions/backfill/upload-url', { room: input.room, contentType: input.contentType, bytes: input.file.size });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', input.contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onStage({ kind: 'uploading', percent: Math.round((e.loaded / e.total) * 100) });
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the file (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('The upload was cut off. Check the connection and try again.'));
    xhr.send(input.file);
  });
  onStage({ kind: 'transcribing' });
  const { jobId } = await api.post<{ jobId: string }>('/captions/backfill', {
    room: input.room,
    key,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    deskNow: new Date().toISOString(),
    replace: true,
  });
  // a day of audio takes a few minutes; give it up to an hour
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const job = await api.get<{ state: string; error?: string } & Partial<RecaptionResult>>(`/captions/backfill/${jobId}`).catch(() => null);
    if (!job) continue;
    if (job.state === 'completed') return { inserted: job.inserted ?? 0, skipped: job.skipped ?? 0, sessions: job.sessions ?? [], shiftedMs: job.shiftedMs ?? null, staleRemoved: job.staleRemoved ?? 0 };
    if (job.state === 'failed') throw new Error(job.error || 'The recording could not be transcribed.');
  }
  throw new Error('Still transcribing after an hour; check back later.');
}
