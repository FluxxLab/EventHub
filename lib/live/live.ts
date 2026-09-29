/** `GET /sessions/board`: every session of the current edition, by start. */
export type BoardSession = {
  id: string;
  title: string;
  day: number;
  startsAt: string;
  endsAt: string;
  room: string;
  track: string;
  type: string;
  status: 'scheduled' | 'live' | 'completed';
  speakers: { id: string; name: string; role: string | null; organisation: string | null }[];
};

export type BroadcastFlags = { cutToBreak: boolean; captionsOverlay: boolean; signLanguageOverlay: boolean };

/** `GET /live-ops/overview`: the live sessions, with who is watching and whether the room's audio feed is up. */
export type LiveSession = { id: string; title: string; room: string; viewers: number; captionListeners: number; capturing: boolean; flags: BroadcastFlags };

export type RoomState = {
  room: string;
  /** The session live in this room, if any, with its live metrics when the overview has them. */
  live: (BoardSession & { metrics: LiveSession | null }) | null;
  /** The next scheduled session in this room on that day, after the live one (or after now). */
  next: BoardSession | null;
  /** Sessions in this room on that day, in order. */
  sessions: BoardSession[];
  /** More than one session marked live here: the API does not prevent it. */
  conflict: boolean;
};

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * The programme day to run: the day whose sessions fall on today's date, else a day with a live
 * session, else day 1 (rehearsal before the event).
 */
export function currentDay(board: BoardSession[], now: Date = new Date()): { day: number; isToday: boolean } {
  const today = localDate(now.toISOString());
  const todays = board.find((s) => localDate(s.startsAt) === today);
  if (todays) return { day: todays.day, isToday: true };
  const live = board.find((s) => s.status === 'live');
  return { day: live?.day ?? Math.min(...board.map((s) => s.day), 1), isToday: false };
}

const roomKey = (room: string) => room.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * One state per room for a day: its live session (joined to the live metrics), what is next,
 * and whether it has two sessions live at once. Rooms with something live come first.
 */
export function roomStates(board: BoardSession[], overview: LiveSession[], day: number, now: Date = new Date()): RoomState[] {
  const metrics = new Map(overview.map((m) => [m.id, m]));
  const rooms = new Map<string, BoardSession[]>();
  for (const s of board) {
    // A live session always shows, even if the day filter would hide it.
    if (s.day !== day && s.status !== 'live') continue;
    const key = roomKey(s.room);
    rooms.set(key, [...(rooms.get(key) ?? []), s]);
  }
  const states = [...rooms.values()].map((sessions): RoomState => {
    const ordered = [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const lives = ordered.filter((s) => s.status === 'live');
    const live = lives[0] ?? null;
    const after = live ? Date.parse(live.startsAt) : now.getTime() - 60 * 60_000;
    const next = ordered.find((s) => s.status === 'scheduled' && Date.parse(s.startsAt) >= after && s.id !== live?.id) ?? null;
    return {
      room: ordered[0]!.room.trim(),
      live: live ? { ...live, metrics: metrics.get(live.id) ?? null } : null,
      next,
      sessions: ordered,
      conflict: lives.length > 1,
    };
  });
  return states.sort((a, b) => Number(!!b.live) - Number(!!a.live) || a.room.localeCompare(b.room));
}

/** Totals across live rooms for the summary strip. */
export function totals(rooms: RoomState[]) {
  const live = rooms.filter((r) => r.live);
  return {
    liveRooms: live.length,
    rooms: rooms.length,
    viewers: live.reduce((sum, r) => sum + (r.live?.metrics?.viewers ?? 0), 0),
    listeners: live.reduce((sum, r) => sum + (r.live?.metrics?.captionListeners ?? 0), 0),
    capturing: live.filter((r) => r.live?.metrics?.capturing).length,
    onBreak: live.filter((r) => r.live?.metrics?.flags.cutToBreak).length,
  };
}
