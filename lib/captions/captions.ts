/** One caption line, as the `caption` socket event and the catch-up route send it. */
export type Caption = {
  text: string;
  isFinal: boolean;
  /** Diarised speaker number, when the room captures with speaker separation. */
  speaker?: number | null;
  at: string;
  seq: number;
  /** Filled in after the fact (a gap the live stream missed). */
  backfill?: boolean;
};

/** `GET /captions/:id/captions`: recent final lines, oldest first. */
export type RecentCaption = { text: string; speaker: number | null; at: string; seq: number };

export type Feed = { finals: Caption[]; interim: Caption | null };
export const EMPTY_FEED: Feed = { finals: [], interim: null };

/** How many final lines the monitor keeps on screen. */
export const MAX_LINES = 400;

/**
 * Folds one incoming line into the feed. Finals are kept in `seq` order without duplicates (a
 * backfilled line lands in its place, not at the end) and clear the in-progress line; an interim
 * replaces the in-progress line. Oldest lines drop off past `max`.
 */
export function mergeCaption(feed: Feed, line: Caption, max = MAX_LINES): Feed {
  if (!line.isFinal) return { ...feed, interim: line };
  if (feed.finals.some((f) => f.seq === line.seq)) return { ...feed, interim: line.backfill ? feed.interim : null };
  const finals = [...feed.finals, line].sort((a, b) => a.seq - b.seq).slice(-max);
  return { finals, interim: line.backfill ? feed.interim : null };
}

/** Seeds the feed from the catch-up route, keeping any live lines that arrived first. */
export function seedFeed(feed: Feed, recent: RecentCaption[]): Feed {
  return recent.reduce<Feed>((acc, r) => mergeCaption(acc, { ...r, isFinal: true }, MAX_LINES), feed);
}

/** "Speaker 1" from the zero-based diarised number, or null when not diarised. */
export const speakerLabel = (speaker: number | null | undefined) => (speaker == null ? null : `Speaker ${speaker + 1}`);

/**
 * Consecutive lines by the same speaker, grouped into paragraphs for reading: a new paragraph
 * when the speaker changes or after a pause of more than `gapMs`.
 */
export function paragraphs(lines: Caption[], gapMs = 8000): { speaker: number | null; at: string; lines: Caption[] }[] {
  const out: { speaker: number | null; at: string; lines: Caption[] }[] = [];
  for (const line of lines) {
    const last = out.at(-1);
    const prev = last?.lines.at(-1);
    const speaker = line.speaker ?? null;
    if (last && last.speaker === speaker && prev && Date.parse(line.at) - Date.parse(prev.at) <= gapMs) last.lines.push(line);
    else out.push({ speaker, at: line.at, lines: [line] });
  }
  return out;
}

/** The browser's best recording format for the capture desk: WebM/Opus, which the API decodes. */
export function captureMimeType(isSupported: (type: string) => boolean): string | null {
  return ['audio/webm;codecs=opus', 'audio/webm'].find(isSupported) ?? null;
}

/* -------------------------------------------------------------- sound desk */

/** One audio input at the sound desk (a device, or a pair of an interface's channels). */
export type DeskInput = { deviceId: string; label: string; channels: number };

/** A single channel of a single input, the unit a room is mapped to: "<deviceId>#<channel>". */
export const sourceKey = (deviceId: string, channel: number) => `${deviceId}#${channel}`;

export function parseSourceKey(key: string): { deviceId: string; channel: number } | null {
  const at = key.lastIndexOf('#');
  const channel = Number(key.slice(at + 1));
  if (at <= 0 || !Number.isInteger(channel) || channel < 0) return null;
  return { deviceId: key.slice(0, at), channel };
}

/** Every channel of every input, as the options a room can be mapped to. */
export function sourceOptions(inputs: DeskInput[]): { value: string; label: string }[] {
  return inputs.flatMap((input) =>
    Array.from({ length: input.channels }, (_, channel) => ({
      value: sourceKey(input.deviceId, channel),
      label: input.channels === 1 ? input.label : `${input.label} · Ch ${channel + 1}`,
    })),
  );
}

/** The meter floor: anything quieter reads as silence. */
export const FLOOR_DB = -60;

/** Peak level of one analyser frame (unsigned 8-bit samples) in dBFS, from FLOOR_DB to 0. */
export function peakDb(samples: Uint8Array): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v - 128) / 128);
  return peak === 0 ? FLOOR_DB : Math.max(FLOOR_DB, Math.min(0, 20 * Math.log10(peak)));
}

/** How far up the meter a level sits, 0 at the floor to 1 at full scale. */
export const meterFraction = (db: number) => Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));

/** The broadcast zones: green below -12 dBFS, amber to -3, red above (about to clip). */
export const meterZone = (db: number): "ok" | "hot" | "clip" => (db > -3 ? "clip" : db > -12 ? "hot" : "ok");

/** Live sessions whose room this desk is not captioning, the one thing an operator must catch. */
export function uncaptioned<T extends { room: string }>(live: T[], captioning: string[]): T[] {
  return live.filter((s) => !captioning.some((room) => sameRoom(room, s.room)));
}

/** Rooms are matched the way the server matches them: trimmed, case-insensitive. */
export const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The desk's rooms: the day's programme rooms plus any added by hand, once each, in order. */
export function deskRooms(...lists: string[][]): string[] {
  const out: string[] = [];
  for (const room of lists.flat().map((r) => r.trim())) {
    if (room && !out.some((r) => sameRoom(r, room))) out.push(room);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Which channel feeds which room, remembered on this computer between days. */
export type DeskPatch = Record<string, { source: string; diarise: boolean }>;

export function readPatch(raw: string | null): DeskPatch {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DeskPatch = {};
    for (const [room, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as { source?: unknown; diarise?: unknown } | null;
      if (v && typeof v.source === 'string') out[room] = { source: v.source, diarise: v.diarise === true };
    }
    return out;
  } catch {
    return {};
  }
}
