/**
 * Public display boards: TVs and projectors around the venue, run from a browser on a staff login
 * full-screen (F toggles it). A lobby board shows what is on in every
 * room and the latest announcements; a room board shows its session with the live poll, the top
 * questions and captions. Everything shown is public; nothing names a delegate but a question's
 * asker, which delegates already see in the app.
 */

import type { ModComment } from '@/lib/discussions/discussions';
import type { BoardSession } from '@/lib/live/live';
import type { SentNotification } from '@/lib/notifications/notifications';
import type { Question } from '@/lib/questions/questions';

export type DisplayKind = 'lobby' | 'room' | 'discussion';

export type DisplayConfig = {
  kind: DisplayKind;
  /** The room a room board or discussion wall follows. */
  room: string | null;
  /** Live captions along the bottom of a room board. */
  captions: boolean;
  /** Where the "Get the app" QR leads; no QR without one. */
  appUrl: string | null;
  /** A line such as "Wi-Fi: PIC-Guest · password summit2027". */
  wifi: string | null;
  /** How long each page stays before the next. */
  seconds: number;
};

const KEY = 'pic.display';

export function loadDisplay(): DisplayConfig | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<DisplayConfig>) : null;
    if (!v || (v.kind !== 'lobby' && v.kind !== 'room' && v.kind !== 'discussion') ) return null;
    return { kind: v.kind, room: v.room ?? null, captions: v.captions !== false, appUrl: v.appUrl ?? null, wifi: v.wifi ?? null, seconds: typeof v.seconds === 'number' ? v.seconds : 15 };
  } catch {
    return null;
  }
}

export function saveDisplay(config: DisplayConfig | null) {
  try {
    if (config) window.sessionStorage.setItem(KEY, JSON.stringify(config));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // private window: the board lasts until the page is reloaded
  }
}

const t = (iso: string) => new Date(iso).getTime();

/** On now: marked live by the room's operator, or (if nobody pressed Go live) within its times. */
export function isOn(s: BoardSession, now: Date): boolean {
  if (s.status === 'live') return true;
  if (s.status === 'completed') return false;
  return t(s.startsAt) <= now.getTime() && now.getTime() < t(s.endsAt);
}

/** Every room's current session, and what starts next across the venue within the next hours. */
export function lobby(board: BoardSession[], now: Date, horizonHours = 3, maxNext = 6): { now: BoardSession[]; next: BoardSession[] } {
  const on = board.filter((s) => isOn(s, now)).sort((a, b) => a.room.localeCompare(b.room));
  const busy = new Set(on.map((s) => s.id));
  const until = now.getTime() + horizonHours * 3_600_000;
  const next = board
    .filter((s) => !busy.has(s.id) && s.status === 'scheduled' && t(s.startsAt) > now.getTime() && t(s.startsAt) <= until)
    .sort((a, b) => t(a.startsAt) - t(b.startsAt) || a.room.localeCompare(b.room))
    .slice(0, maxNext);
  return { now: on, next };
}

/** One room: its session now (if any) and the next one there today. */
export function roomNow(board: BoardSession[], room: string, now: Date): { current: BoardSession | null; next: BoardSession | null } {
  const here = board.filter((s) => s.room === room).sort((a, b) => t(a.startsAt) - t(b.startsAt));
  const current = here.find((s) => s.status === 'live') ?? here.find((s) => isOn(s, now)) ?? null;
  const today = now.toDateString();
  const next = here.find((s) => s.id !== current?.id && s.status === 'scheduled' && t(s.startsAt) > now.getTime() && new Date(s.startsAt).toDateString() === today) ?? null;
  return { current, next };
}

/** The rooms that have sessions, in order. */
export const roomsOf = (board: BoardSession[]) => [...new Set(board.map((s) => s.room).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** "12 min left", "Ends 14:30" once over an hour, "Running over" past its end. */
export function timeLeft(s: BoardSession, now: Date): string {
  const left = Math.ceil((t(s.endsAt) - now.getTime()) / 60_000);
  if (left <= 0) return 'Running over';
  if (left > 60) return `Ends ${hhmm(s.endsAt)}`;
  return `${left} min left`;
}

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Speakers as one line: "Amina Yusuf, Ngozi Eze and 2 more". */
export function speakerLine(s: Pick<BoardSession, 'speakers'>, max = 3): string {
  const names = s.speakers.map((p) => p.name);
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** Announcements for this event (or everyone) sent in the last few hours, newest first. */
export function recentNotices(sent: SentNotification[], editionId: string | null, now: Date, hours = 6, max = 3): SentNotification[] {
  const since = now.getTime() - hours * 3_600_000;
  return sent
    .filter((n) => n.sentAt && t(n.sentAt) >= since && !n.delegateId && (!n.editionId || n.editionId === editionId))
    .sort((a, b) => t(b.sentAt!) - t(a.sentAt!))
    .slice(0, max);
}

/** The questions worth putting on a screen: open ones, most upvoted first. */
export function topQuestions(questions: Question[], max = 4): Question[] {
  return questions
    .filter((q) => q.status === 'open')
    .sort((a, b) => b.upvotes - a.upvotes || t(a.createdAt) - t(b.createdAt))
    .slice(0, max);
}

/* ------------------------------------------------------------------ pages */

/** Rows per page: few enough to read across a hall on a low-resolution screen. */
export const ROWS_PER_PAGE = 6;
export const PAGE_SECONDS = [10, 15, 20, 30] as const;

export type RowState = 'now' | 'done' | 'later';

/** The programme day a lobby board shows: today's, else the next day with sessions, else the last one. */
export function programmeDay(board: BoardSession[], now: Date): { day: number; date: string; sessions: BoardSession[] } | null {
  if (board.length === 0) return null;
  const byDay = new Map<number, BoardSession[]>();
  for (const s of board) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const days = [...byDay.entries()].map(([day, list]) => ({ day, list: list.sort((a, b) => t(a.startsAt) - t(b.startsAt) || a.room.localeCompare(b.room)) })).sort((a, b) => a.day - b.day);
  const today = now.toDateString();
  const pick = days.find((d) => d.list.some((s) => new Date(s.startsAt).toDateString() === today)) ?? days.find((d) => t(d.list[0]!.startsAt) > now.getTime()) ?? days.at(-1)!;
  const first = new Date(pick.list[0]!.startsAt);
  return { day: pick.day, date: first.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), sessions: pick.list };
}

export const rowState = (s: BoardSession, now: Date): RowState => (isOn(s, now) ? 'now' : s.status === 'completed' || t(s.endsAt) <= now.getTime() ? 'done' : 'later');

export type LobbyPage = { kind: 'programme'; rows: BoardSession[]; part: number; parts: number } | { kind: 'notices'; rows: SentNotification[] } | { kind: 'empty' };

const chunk = <T>(rows: T[], size = ROWS_PER_PAGE): T[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

/** The lobby as pages: the day's programme, six rows a page, then any announcements. */
export function lobbyPages(sessions: BoardSession[], notices: SentNotification[]): LobbyPage[] {
  const parts = chunk(sessions);
  const pages: LobbyPage[] = [
    ...parts.map((rows, i) => ({ kind: 'programme' as const, rows, part: i + 1, parts: parts.length })),
    ...(notices.length ? [{ kind: 'notices' as const, rows: notices.slice(0, 4) }] : []),
  ];
  return pages.length ? pages : [{ kind: 'empty' }];
}

/** The page to open on: the one holding what is on now, else the first still to come. */
export function startPage(pages: LobbyPage[], now: Date): number {
  const holds = (want: RowState) => pages.findIndex((p) => p.kind === 'programme' && p.rows.some((s) => rowState(s, now) === want));
  const at = holds('now');
  if (at >= 0) return at;
  const later = holds('later');
  return later >= 0 ? later : 0;
}

export type RoomPage = { kind: 'poll' } | { kind: 'session' } | { kind: 'questions' } | { kind: 'next' };

/** A room board's pages: an open poll holds the screen; otherwise the session, its questions, what's next. */
export function roomPages(state: { hasSession: boolean; pollOpen: boolean; questions: number; hasNext: boolean }): RoomPage[] {
  if (state.pollOpen) return [{ kind: 'poll' }];
  const pages: RoomPage[] = [];
  if (state.hasSession) pages.push({ kind: 'session' });
  if (state.hasSession && state.questions > 0) pages.push({ kind: 'questions' });
  if (state.hasNext || !state.hasSession) pages.push({ kind: 'next' });
  return pages;
}

/* ------------------------------------------------------------------ departures-board status */

export type BoardStatus = { label: 'On now' | 'Running over' | 'Starting soon' | 'Upcoming' | 'Ended'; tone: 'green' | 'yellow' | 'blue' | 'dim' };

/** A session's status as the departures board says it: on now, starting within 15 minutes, upcoming, ended. */
export function boardStatus(s: BoardSession, now: Date): BoardStatus {
  const state = rowState(s, now);
  if (state === 'now') return t(s.endsAt) <= now.getTime() ? { label: 'Running over', tone: 'yellow' } : { label: 'On now', tone: 'green' };
  if (state === 'done') return { label: 'Ended', tone: 'dim' };
  return t(s.startsAt) - now.getTime() <= 15 * 60_000 ? { label: 'Starting soon', tone: 'yellow' } : { label: 'Upcoming', tone: 'blue' };
}

/* ------------------------------------------------------------------ lobby: a row per room */

export type RoomRow = { room: string; now: BoardSession | null; next: BoardSession | null };

/**
 * The lobby as one row per room, from the programme day's sessions: what is on there now (if
 * anything) and what is up next. Rooms keep a steady alphabetical order so each has its own line.
 */
export function roomRows(sessions: BoardSession[], now: Date): RoomRow[] {
  return roomsOf(sessions).map((room) => {
    const here = sessions.filter((s) => s.room === room).sort((a, b) => t(a.startsAt) - t(b.startsAt));
    const current = here.find((s) => s.status === 'live') ?? here.find((s) => isOn(s, now)) ?? null;
    const next = here.find((s) => s.id !== current?.id && s.status !== 'completed' && s.status !== 'live' && t(s.startsAt) > now.getTime()) ?? null;
    return { room, now: current, next };
  });
}

export type RoomsPage = { kind: 'rooms'; rows: RoomRow[]; part: number; parts: number } | { kind: 'notices'; rows: SentNotification[] } | { kind: 'empty' };

/** The lobby's pages: the rooms, six a page, then any announcements. */
export function roomsPages(rows: RoomRow[], notices: SentNotification[]): RoomsPage[] {
  const parts = chunk(rows);
  const pages: RoomsPage[] = [
    ...parts.map((r, i) => ({ kind: 'rooms' as const, rows: r, part: i + 1, parts: parts.length })),
    ...(notices.length ? [{ kind: 'notices' as const, rows: notices.slice(0, 4) }] : []),
  ];
  return pages.length ? pages : [{ kind: 'empty' }];
}

/** An announcement sent in the last couple of minutes: the lobby turns straight to it. */
export function freshNotice(notices: SentNotification[], now: Date, withinMs = 2 * 60_000): SentNotification | null {
  return notices.find((n) => n.sentAt && now.getTime() - t(n.sentAt) <= withinMs) ?? null;
}

/* ------------------------------------------------------------------ discussion wall */

/**
 * The session a room's discussion wall shows: the one on now, else the next one there, else the
 * room's last one of the day, whose thread stays up until something else starts.
 */
export function wallSession(sessions: BoardSession[], room: string, now: Date): BoardSession | null {
  const { current, next } = roomNow(sessions, room, now);
  if (current) return current;
  const here = sessions.filter((s) => s.room === room).sort((a, b) => t(a.startsAt) - t(b.startsAt));
  const today = now.toDateString();
  const earlier = here.filter((s) => t(s.startsAt) <= now.getTime() && new Date(s.startsAt).toDateString() === today).at(-1);
  return earlier ?? next ?? null;
}

/**
 * What goes up on a public screen: comments still showing, newest first. Reported ones wait for a
 * moderator before they reach the big screen, even though the app still shows them.
 */
export const wallComments = (comments: ModComment[], max = 5): ModComment[] =>
  comments
    .filter((c) => !c.hiddenAt && !c.flagged)
    .sort((a, b) => t(b.createdAt) - t(a.createdAt))
    .slice(0, max);

/** The comments the room liked most (at least one like), ties to the newer one. */
export const mostLiked = (comments: ModComment[], max = 3): ModComment[] =>
  comments
    .filter((c) => !c.hiddenAt && !c.flagged && c.likes > 0)
    .sort((a, b) => b.likes - a.likes || t(b.createdAt) - t(a.createdAt))
    .slice(0, max);

/** The room's reaction across the thread: likes and dislikes, and the share that is positive. */
export function roomReaction(comments: ModComment[]): { likes: number; dislikes: number; positive: number | null } {
  const shown = comments.filter((c) => !c.hiddenAt && !c.flagged);
  const likes = shown.reduce((n, c) => n + c.likes, 0);
  const dislikes = shown.reduce((n, c) => n + c.dislikes, 0);
  return { likes, dislikes, positive: likes + dislikes ? Math.round((likes / (likes + dislikes)) * 100) : null };
}
