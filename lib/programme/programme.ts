import { z } from 'zod';

/** `GET /sessions?editionId=`: the edition's sessions, flat, ordered by start. Fields the page uses. */

/** One of the event's tracks (see lib/catalog/topics) or `general`, the bucket every event has. */
export type SessionTrack = string;

export const SESSION_TYPES = [
  'plenary',
  'parallel',
  'panel',
  'roundtable',
  'workshop',
  'keynote',
  'fireside',
  'networking',
  'break',
  'ceremony',
  'awards',
  'closing',
  'other',
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const TYPE_LABEL: Record<SessionType, string> = {
  plenary: 'Plenary',
  parallel: 'Parallel session',
  panel: 'Panel',
  roundtable: 'Roundtable',
  workshop: 'Workshop',
  keynote: 'Keynote',
  fireside: 'Fireside chat',
  networking: 'Networking',
  break: 'Break',
  ceremony: 'Ceremony',
  awards: 'Awards',
  closing: 'Closing',
  other: 'Other',
};

export type SessionStatus = 'scheduled' | 'live' | 'completed';
export const STATUS_LABEL: Record<SessionStatus, string> = { scheduled: 'Scheduled', live: 'Live', completed: 'Completed' };

export type Speaker = { id: string; name: string; role: string | null; organisation: string | null; avatarUrl: string | null };

export type Session = {
  id: string;
  title: string;
  description: string;
  day: number;
  startsAt: string;
  endsAt: string;
  track: SessionTrack;
  type: string;
  status: SessionStatus;
  room: string;
  editionId: string | null;
  speakers: Speaker[];
};

/** The API accepts days 1 and 2 only. */
export const MAX_DAY = 2;

/** The type's label, or the raw value if the API ever sends one the console does not know. */
export const typeLabel = (type: string) => TYPE_LABEL[type as SessionType] ?? type;

/** "09:00 – 10:30", in the viewer's time. */
export function timeRange(startsAt: string, endsAt: string): string {
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${hm(startsAt)} – ${hm(endsAt)}`;
}

/** Minutes between start and end, for "90 min". */
export const durationMinutes = (startsAt: string, endsAt: string) => Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);

/** Day N of an edition as a local "YYYY-MM-DD" (day 1 is the start date). */
export function dayDate(editionStartsAt: string, day: number): string {
  const d = new Date(editionStartsAt);
  d.setDate(d.getDate() + day - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sessions matching a track and a search over title, room and speaker names. */
export function filterSessions(sessions: Session[], { track, query }: { track: SessionTrack | 'all'; query: string }): Session[] {
  const q = query.trim().toLowerCase();
  return sessions.filter(
    (s) =>
      (track === 'all' || s.track === track) &&
      (!q || s.title.toLowerCase().includes(q) || s.room.toLowerCase().includes(q) || s.speakers.some((sp) => sp.name.toLowerCase().includes(q))),
  );
}

/** Sessions grouped by day number, each day in start order. Days with no sessions are left out. */
export function groupByDay(sessions: Session[]): { day: number; sessions: Session[] }[] {
  const days = new Map<number, Session[]>();
  for (const s of sessions) days.set(s.day, [...(days.get(s.day) ?? []), s]);
  return [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, list]) => ({ day, sessions: [...list].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) }));
}

/* ------------------------------------------------------------- create form */

/** Room names the API refuses, because captions cannot be routed to them. */
const PLACEHOLDER_ROOMS = new Set(['tbc', 'tba', 'tbd', 'n/a', 'none', '-']);

export const createSessionSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter the session title.').max(255, 'Keep the title under 255 characters.'),
    description: z.string().trim().min(1, 'Describe the session in a line or two.'),
    type: z.enum(SESSION_TYPES),
    track: z.string().min(1, 'Choose a track.'),
    day: z.number().int().min(1).max(MAX_DAY),
    /** The edition's calendar date for that day, "YYYY-MM-DD". */
    date: z.string().min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    room: z
      .string()
      .trim()
      .min(1, 'Enter the room.')
      .max(255, 'Keep the room under 255 characters.')
      .refine((room) => !PLACEHOLDER_ROOMS.has(room.toLowerCase()), 'Use the real room name. Placeholders like TBC cannot receive captions.'),
  })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'It has to end after it starts.' });

export type CreateSessionForm = z.input<typeof createSessionSchema>;

/** The form as the `POST /sessions` body. Times go as UTC instants, which carry the offset the API requires. */
export function toSessionBody(form: z.output<typeof createSessionSchema>, editionId: string) {
  return {
    title: form.title,
    description: form.description,
    type: form.type,
    track: form.track,
    day: form.day,
    startsAt: new Date(`${form.date}T${form.startTime}`).toISOString(),
    endsAt: new Date(`${form.date}T${form.endTime}`).toISOString(),
    room: form.room.replace(/\s+/g, ' '),
    editionId,
  };
}

/** A session as the Add session form's values, for editing it. */
export function sessionToForm(s: Session): Omit<CreateSessionForm, 'date'> {
  const hm = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return {
    title: s.title,
    description: s.description ?? '',
    type: (SESSION_TYPES as readonly string[]).includes(s.type) ? (s.type as SessionType) : 'panel',
    track: s.track,
    day: s.day,
    startTime: hm(s.startsAt),
    endTime: hm(s.endsAt),
    room: s.room,
  };
}
