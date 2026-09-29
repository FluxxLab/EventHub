import type { IngestRoom } from '@/lib/ingest/ingest';

const minutes = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Minutes past its scheduled end before a still-live session is flagged (NEXT_PUBLIC_OVERRUN_GRACE_MIN, default 10). */
export const OVERRUN_GRACE_MIN = minutes(process.env.NEXT_PUBLIC_OVERRUN_GRACE_MIN, 10);
/** Minutes past its scheduled start before a session not yet live is flagged (NEXT_PUBLIC_LATE_START_MIN, default 5). */
export const LATE_START_MIN = minutes(process.env.NEXT_PUBLIC_LATE_START_MIN, 5);

export type LiveSessionLike = { id: string; title: string; room: string; endsAt: string };
export type ScheduledSessionLike = LiveSessionLike & { startsAt: string; status: string };

export type OpsProblem = {
  /** Stable per problem, so a watcher alerts once, not on every poll. */
  key: string;
  kind: 'overrun' | 'late-start' | 'stream-error' | 'stream-silent';
  room: string;
  title: string;
  body: string;
};

const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Whole minutes a live session has run past its end, or 0 while it is within the grace. */
export function overrunMinutes(session: Pick<LiveSessionLike, 'endsAt'>, now: Date): number {
  const over = Math.floor((now.getTime() - Date.parse(session.endsAt)) / 60_000);
  return over >= OVERRUN_GRACE_MIN ? over : 0;
}

/**
 * Whole minutes a scheduled session is overdue to go live, or 0: within the grace, already live
 * or over, or its slot has passed (then it is simply not happening).
 */
export function lateMinutes(session: Pick<ScheduledSessionLike, 'startsAt' | 'endsAt' | 'status'>, now: Date): number {
  if (session.status !== 'scheduled' || now.getTime() >= Date.parse(session.endsAt)) return 0;
  const late = Math.floor((now.getTime() - Date.parse(session.startsAt)) / 60_000);
  return late >= LATE_START_MIN ? late : 0;
}

/**
 * What an organiser should hear about without looking: a session overdue to go live (captions
 * only start once it is), one still live well past its end (captions keep running, and billing,
 * until someone ends it), a venue stream reporting an encoder error, and a live session whose
 * stream is not sending while nothing else captions it.
 */
export function opsProblems(
  live: LiveSessionLike[],
  streams: IngestRoom[] | null,
  now: Date,
  /** Today's programme; sessions due to have started are flagged if their room has nothing live. */
  programme: ScheduledSessionLike[] = [],
): OpsProblem[] {
  const out: OpsProblem[] = [];
  for (const session of programme) {
    const late = lateMinutes(session, now);
    if (late && !live.some((l) => sameRoom(l.room, session.room))) {
      out.push({
        key: `late:${session.id}`,
        kind: 'late-start',
        room: session.room,
        title: `Not live yet, ${late} min late`,
        body: `“${session.title}” was due to start in ${session.room} at ${hm(session.startsAt)}. Captions only run once it is live: press Go live on Live ops.`,
      });
    }
  }
  for (const session of live) {
    const over = overrunMinutes(session, now);
    if (over) {
      out.push({
        key: `overrun:${session.id}`,
        kind: 'overrun',
        room: session.room,
        title: `Still live ${over} min past its end`,
        body: `“${session.title}” in ${session.room} was due to end at ${hm(session.endsAt)}. End it if it is over: captions run until it is.`,
      });
    }
  }
  for (const room of streams ?? []) {
    const state = room.stream?.state;
    if (state === 'error') {
      out.push({
        key: `stream-error:${room.room}`,
        kind: 'stream-error',
        room: room.room,
        title: `${room.room}: encoder error`,
        body: 'The venue stream reports an error. Ask the AV team to restart it, or caption the room from the Sound desk.',
      });
      continue;
    }
    const session = live.find((s) => sameRoom(s.room, room.room));
    if (session && room.stream && state !== 'publishing' && !room.captioning) {
      out.push({
        key: `stream-silent:${room.room}:${session.id}`,
        kind: 'stream-silent',
        room: room.room,
        title: `${room.room}: no captions`,
        body: `“${session.title}” is live, but the venue stream is not sending. Check the encoder, or start the room on the Sound desk.`,
      });
    }
  }
  return out;
}
