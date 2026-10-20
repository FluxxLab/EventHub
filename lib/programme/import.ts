/**
 * Importing a programme: a sheet of sessions (an agenda table pasted into Excel, a CSV, or cells
 * copied from Google Sheets) becomes sessions on one event, with their speakers, through
 * `POST /speakers` for people not on file and `POST /sessions/bulk` in batches. Everything here is
 * pure: finding the table, reading times and days the way agendas write them, splitting a speakers
 * cell into people, and matching them to the speakers already on file, before anything is sent.
 */

import { parseTable, type SheetCell } from '@/lib/delegates/import';
import { dayDate, MAX_DAY, SESSION_TYPES, type Session, type SessionType, type Speaker } from '@/lib/programme/programme';

export const MAX_ROWS = 1_000;
/** Sessions per `POST /sessions/bulk`: delegates get one "Programme updated" push per batch. */
export const BATCH_SIZE = 50;

export const SESSION_FIELDS = ['title', 'type', 'time', 'start', 'end', 'day', 'date', 'room', 'track', 'speakers', 'moderators', 'description'] as const;
export type SessionField = (typeof SESSION_FIELDS)[number];

export const FIELD_LABEL: Record<SessionField, string> = {
  title: 'Session title',
  type: 'Type',
  time: 'Time (start – end)',
  start: 'Start time',
  end: 'End time',
  day: 'Day',
  date: 'Date',
  room: 'Room',
  track: 'Track',
  speakers: 'Speakers',
  moderators: 'Moderator or chair',
  description: 'Description',
};

/** Which column (index) holds each field; -1 when the sheet does not have it. */
export type Mapping = Record<SessionField, number>;

/** The sheet from its heading row down. `preamble` is any text above the headings ("Day One — Wednesday…"). */
export type ProgrammeTable = { headers: string[]; rows: string[][]; preamble: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------- reading */

/**
 * A workbook cell as text. Excel keeps a time-only cell as a fraction of a day, which reaches us as
 * a Date on its day zero (30 Dec 1899) or as the bare fraction; both come out as "HH:MM".
 */
function cellText(v: SheetCell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const hm = `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    if (v.getUTCFullYear() < 1901) return hm;
    const date = v.toISOString().slice(0, 10);
    return v.getUTCHours() || v.getUTCMinutes() ? `${date} ${hm}` : date;
  }
  if (typeof v === 'number') {
    if (v > 0 && v < 1) {
      const minutes = Math.round(v * 1440);
      return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }
    return Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false }) : String(v);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/** An Excel sheet as rows of text. Line breaks inside a cell are kept: a speakers cell needs them. */
export const gridFromSheet = (data: SheetCell[][]): string[][] => data.map((r) => r.map((c) => cellText(c).trim()));

/** CSV, or cells pasted from Excel or Google Sheets, as rows of text. */
export function gridFromText(text: string): string[][] {
  const t = parseTable(text);
  return t.headers.length ? [t.headers, ...t.rows] : [];
}

/** Heading names each field goes by, in hand-made sheets and agenda tables ("Session / Title", "Responsible party"). */
const ALIASES: Record<SessionField, string[]> = {
  title: ['title', 'session', 'sessiontitle', 'sessionname', 'topic', 'sessiontopic', 'talk', 'agendaitem', 'item', 'activity', 'name'],
  type: ['type', 'sessiontype', 'format', 'kind', 'category'],
  time: ['time', 'times', 'timeslot', 'slot', 'period', 'schedule', 'duration'],
  start: ['start', 'starttime', 'starts', 'startsat', 'from', 'begin', 'begins', 'begintime'],
  end: ['end', 'endtime', 'ends', 'endsat', 'to', 'finish', 'finishes', 'finishtime'],
  day: ['day', 'dayno', 'daynumber', 'programmeday'],
  date: ['date', 'sessiondate'],
  room: ['room', 'venue', 'location', 'hall', 'roomvenue', 'place'],
  track: ['track', 'tracks', 'stream', 'theme', 'strand'],
  speakers: ['speakers', 'speaker', 'responsibleparty', 'responsible', 'panelists', 'panellists', 'presenters', 'presenter', 'facilitators', 'facilitator', 'resourcepersons', 'people'],
  moderators: ['moderator', 'moderators', 'chair', 'chairs', 'sessionchair', 'host', 'compere'],
  description: ['description', 'summary', 'abstract', 'details', 'about', 'notes', 'synopsis'],
};
/** The order fields claim columns in, so "Start time" goes to start before time can take it loosely. */
const CLAIM_ORDER: SessionField[] = ['start', 'end', 'time', 'day', 'date', 'room', 'track', 'type', 'speakers', 'moderators', 'description', 'title'];

const isHeading = (cell: string) => SESSION_FIELDS.some((f) => ALIASES[f].includes(norm(cell)));

/**
 * The table in a sheet: the heading row is the first that names two or more known columns (else
 * the first with two cells filled). An agenda repeats its headings on every page; those rows go.
 */
export function findTable(grid: string[][]): ProgrammeTable {
  const filled = (r: string[]) => r.filter((c) => c.trim() !== '').length;
  let at = grid.findIndex((r) => r.filter(isHeading).length >= 2);
  if (at === -1) at = grid.findIndex((r) => filled(r) >= 2);
  if (at === -1) return { headers: [], rows: [], preamble: [] };
  const headers = grid[at]!;
  const key = headers.map(norm).join('|');
  return {
    headers,
    rows: grid.slice(at + 1).filter((r) => filled(r) > 0 && r.map(norm).join('|') !== key),
    preamble: grid.slice(0, at).flat().filter(Boolean),
  };
}

/** A first guess at which column is which, from the headings. */
export function guessMapping(headers: string[]): Mapping {
  const keys = headers.map(norm);
  const taken = new Set<number>();
  const mapping = Object.fromEntries(SESSION_FIELDS.map((f) => [f, -1])) as Mapping;
  for (const pass of ['exact', 'loose'] as const) {
    for (const field of CLAIM_ORDER) {
      if (mapping[field] !== -1) continue;
      const i = keys.findIndex((k, idx) => !taken.has(idx) && (pass === 'exact' ? ALIASES[field].includes(k) : ALIASES[field].some((a) => a.length > 3 && k.includes(a))));
      if (i !== -1) {
        mapping[field] = i;
        taken.add(i);
      }
    }
  }
  return mapping;
}

/* --------------------------------------------------------------- days, times */

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, first: 1, second: 2, third: 3, fourth: 4 };

/** "2", "Day 2", "Day Two — Thursday", "(DAY 1 PLENARY)", "Second day" → the day number; else null. */
export function readDayNumber(text: string): number | null {
  const t = text.toLowerCase();
  const digit = t.match(/^\s*(\d{1,2})\s*$/) ?? t.match(/\bday\s*(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  const word = t.match(/\bday\s+(one|two|three|four)\b/) ?? t.match(/\b(first|second|third|fourth)\s+day\b/);
  return word ? NUMBER_WORDS[word[1]!]! : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date as "YYYY-MM-DD": "2026-10-21", "21/10/2026" (day first, as written in Nigeria and the UK),
 * "21 October 2026", "Thursday, October 22nd, 2026". Without a year, `year` is used. Else null.
 */
export function readDate(text: string, year: number): string | null {
  const t = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  const make = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3)) + 1;
  const fullYear = (y: string | undefined) => (!y ? year : y.length === 2 ? 2000 + Number(y) : Number(y));
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return make(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/);
  if (m) return make(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/\b(\d{1,2})\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?/);
  if (m && month(m[2]!)) return make(fullYear(m[3]), month(m[2]!), Number(m[1]));
  for (const hit of t.matchAll(/\b([a-z]{3,})\.?\s+(\d{1,2})\b,?(?:\s*(\d{4}))?/g)) {
    if (month(hit[1]!)) return make(fullYear(hit[3]), month(hit[1]!), Number(hit[2]));
  }
  return null;
}

/** Which of the event's days a "YYYY-MM-DD" is, or null when it is not one of them. */
function dayOfDate(date: string, editionStartsAt: string): number | null {
  for (let d = 1; d <= MAX_DAY; d += 1) if (dayDate(editionStartsAt, d) === date) return d;
  return null;
}

/** The working hours an agenda's times are read into when "2:30" could be morning or afternoon. */
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * A time range as an agenda writes it, in 24-hour "HH:MM": "9:00 – 10:30 am", "1:30-2:30pm",
 * "13:30 to 14:15", "9am – 10am", "9:00:00 AM". A suffix written once covers the time it follows;
 * a time with none is read as whichever of morning or afternoon keeps the session within the
 * working day and shortest ("2:30 – 3:30" is 14:30 – 15:30). One time alone gives no end.
 */
export function parseTimeRange(text: string): { start: string; end: string | null } | null {
  const t = text
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/[`'’]/g, '')
    .replace(/\s*:\s*/g, ':')
    .replace(/\bnoon\b/g, '12:00pm');
  const parts = [...t.matchAll(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?(?:\s*([ap])\.?\s*m\b\.?)?/g)]
    .map((m) => ({ h: Number(m[1]), m: m[2] ? Number(m[2]) : 0, suffix: m[3] as 'a' | 'p' | undefined, explicit: !!m[2] || !!m[3] }))
    .filter((p) => p.explicit && p.h <= 23 && p.m <= 59)
    .slice(0, 2);
  if (parts.length === 0) return null;
  const options = ({ h, m, suffix }: (typeof parts)[number]): number[] => {
    if (suffix === 'a') return h > 12 ? [] : [(h % 12) * 60 + m];
    if (suffix === 'p') return h > 12 ? [h * 60 + m] : [((h % 12) + 12) * 60 + m];
    return h === 0 || h >= 12 ? [h * 60 + m] : [h * 60 + m, (h + 12) * 60 + m];
  };
  const outside = (minutes: number) => (minutes < DAY_START || minutes > DAY_END ? 1 : 0);
  if (parts.length === 1) {
    const [best] = options(parts[0]!).sort((a, b) => outside(a) - outside(b));
    return best === undefined ? null : { start: hhmm(best), end: null };
  }
  let best: [number, number] | null = null;
  const score = ([s, e]: [number, number]) => (outside(s) + outside(e)) * 10_000 + (e - s);
  for (const s of options(parts[0]!)) for (const e of options(parts[1]!)) if (e > s && (!best || score([s, e]) < score(best))) best = [s, e];
  return best ? { start: hhmm(best[0]), end: hhmm(best[1]) } : { start: hhmm(options(parts[0]!)[0] ?? 0), end: hhmm(options(parts[1]!)[0] ?? 0) };
}

/* ---------------------------------------------------------------------- types */

/** The API's own rules (sessions/session-types.ts), first hit wins, then a few agenda words it leaves as "other". */
const TYPE_RULES: ReadonlyArray<readonly [RegExp, SessionType]> = [
  [/\bparallel\b/, 'parallel'],
  [/\bbreakout\b/, 'parallel'],
  [/\bplenary\b/, 'plenary'],
  [/\bkeynote\b/, 'keynote'],
  [/\bfireside\b/, 'fireside'],
  [/\bround ?tables?\b/, 'roundtable'],
  [/\bpanel\b/, 'panel'],
  [/\bworkshops?\b/, 'workshop'],
  [/\bclosing\b/, 'closing'],
  [/\bawards?\b/, 'awards'],
  [/\b(opening|ceremony|ceremonies)\b/, 'ceremony'],
  [/\bnetworking\b/, 'networking'],
  [/\b(break|lunch|tea|coffee|breakfast|refreshments?)\b/, 'break'],
  [/\b(anthem|welcome)\b/, 'ceremony'],
  [/\bmaster ?class\b/, 'workshop'],
];

/** The session type a piece of text names ("High-Level Fireside Chat" is fireside), or null. */
export function sessionTypeOf(text: string): SessionType | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if ((SESSION_TYPES as readonly string[]).includes(t)) return t as SessionType;
  return TYPE_RULES.find(([pattern]) => pattern.test(t))?.[1] ?? null;
}

/**
 * An agenda's title cell, often a short label on the first line and the title under it:
 * "Keynote Speech\nAfrica in the Global AI Order" is a keynote titled "Africa in the Global AI Order".
 * A first line that names no type stays as the title's lead: "Lecture: Defining the Compute Ecosystem".
 */
export function splitTitle(cell: string): { title: string; type: SessionType | null } {
  const lines = cell.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (lines.length < 2) return { title: lines[0] ?? '', type: sessionTypeOf(lines[0] ?? '') };
  const [lead, ...rest] = lines;
  const body = rest.join(' ');
  const type = lead!.split(' ').length <= 5 ? sessionTypeOf(lead!) : null;
  if (type) return { title: body, type };
  const title = /[:.?!–—-]$/.test(lead!) ? `${lead} ${body}` : `${lead}: ${body}`;
  return { title, type: sessionTypeOf(title) };
}

/* ------------------------------------------------------------------- speakers */

export type ParsedSpeaker = { name: string; role: string; organisation: string };

/** "Moderator:", "Session Chair:", "Rapporteurs:", "Lead Facilitator:", "Judges;", "Presenters:" before a name, or alone on a line. */
const LABEL = /^(?:session\s+)?(?:co-?)?(?:lead\s+facilitators?|moderators?|chair(?:person)?s?|rapporteurs?|facilitators?|presenters?|panell?ists?|speakers?|judges?|hosts?|comperes?|discussants?)\s*(?:[:;–—-]\s*|$)/i;

/** A line that reads as someone's title or organisation rather than their name. */
const AFFILIATION_WORDS =
  /\b(director|founder|co-?founder|ceo|cto|coo|chief|officer|manager|lead|head|president|dean|professor of|lecturer|minister|commissioner|chairman|secretary|advis[eo]r|analyst|scientist|engineer|consultant|specialist|partner|fellow|editor|coordinator|executive|vice|associate|assistant|senior|representative|ambassador|university|ministry|agency|foundation|centre|center|institute|commission|limited|ltd|plc|bank|council|school|organi[sz]ation|initiative|network|group|company|team|represented)\b/i;
const looksLikeAffiliation = (line: string) => {
  // "Chioma Agwuegbo," is a name: agendas often put a comma after it
  const t = line.replace(/[\s,;:]+$/, '');
  return t.includes(',') || AFFILIATION_WORDS.test(t) || t.split(/\s+/).length > 6;
};

/** "Dr. Kunle Kakanfo (Nigeria)," → "Dr. Kunle Kakanfo". */
const cleanName = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s,;:]+$/, '').replace(/\s+/g, ' ').trim();

/** "Chief Executive Officer, Luminate" → role and organisation, split at the first comma (the way the console joins them). */
function splitAffiliation(text: string): { role: string; organisation: string } {
  const t = text.replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '');
  const comma = t.indexOf(',');
  return comma === -1 ? { role: t, organisation: '' } : { role: t.slice(0, comma).trim(), organisation: t.slice(comma + 1).trim() };
}

/**
 * The people in a speakers cell, written any of these ways:
 * - one per line or separated by semicolons, as `Name | Role | Organisation` (role and organisation optional);
 * - as an agenda prints them: the name on one line, the title under it, a blank line between people;
 * - one name per line.
 * Labels such as "Moderator:" or "Chair:" are dropped. A title with no name above it comes back with
 * an empty name, for the row above to claim (an agenda cell split across a page).
 */
export function parseSpeakers(cell: string): ParsedSpeaker[] {
  const lines = cell.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim().replace(LABEL, '').trim());
  const out: ParsedSpeaker[] = [];
  const person = (name: string, affiliation: string): ParsedSpeaker => ({ name: cleanName(name), ...splitAffiliation(affiliation) });

  if (lines.some((l) => l.includes('|') || l.includes(';'))) {
    for (const entry of lines.flatMap((l) => l.split(';'))) {
      const [name = '', ...rest] = entry.split('|').map((p) => p.trim());
      if (!cleanName(name)) continue;
      out.push(rest.length >= 2 ? { name: cleanName(name), role: rest[0]!, organisation: rest.slice(1).join(', ') } : person(name, rest[0] ?? ''));
    }
    return out;
  }

  // the agenda's layout: blocks of name-then-title, a blank line between people
  const blocks = cell.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim().replace(LABEL, '').trim()).filter(Boolean)).filter((b) => b.length);
  if (blocks.length > 1) {
    for (const [first, ...rest] of blocks) {
      if (looksLikeAffiliation(first!) && !rest.length) {
        // a title alone in its block belongs to the person above it
        const last = out.at(-1);
        if (last && !last.role) Object.assign(last, splitAffiliation(first!));
        else out.push({ name: '', ...splitAffiliation(first!) });
      } else out.push(person(first!, rest.join(' ')));
    }
    return out.filter((s) => s.name || out.indexOf(s) === 0);
  }

  // no blank lines: a name starts each person, and a line that reads as a title goes to the name above it
  for (const line of lines.filter(Boolean)) {
    const last = out.at(-1);
    if (looksLikeAffiliation(line)) {
      if (last && !last.role) Object.assign(last, splitAffiliation(line));
      else if (!last) out.push({ name: '', ...splitAffiliation(line) });
      else last.organisation = [last.organisation, line].filter(Boolean).join(' ');
    } else out.push(person(line, ''));
  }
  return out;
}

/** Titles dropped when matching people by name, so "Dr. Olubayo Adekanmbi" is "Olubayo Adekanmbi". */
const HONORIFICS = new Set([
  'dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'barr', 'barrister', 'engr', 'hon', 'sir', 'chief', 'alhaji', 'alhaja', 'hajia', 'rev', 'pastor', 'amb', 'arc', 'arch', 'pharm', 'sen', 'senator', 'mallam', 'malam', 'dame', 'hrh',
]);

/** A person's name as a matching key: no titles, accents, punctuation, spaces or case. */
export function speakerKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && HONORIFICS.has(words[0]!)) words.shift();
  return words.join('');
}

/* --------------------------------------------------------------------- rows */

export type RowProblem = 'no_title' | 'long_title' | 'no_time' | 'no_end' | 'bad_time' | 'long_session' | 'outside_days' | 'no_room' | 'placeholder_room' | 'unknown_track' | 'duplicate' | 'exists';

export const PROBLEM_LABEL: Record<RowProblem, string> = {
  no_title: 'No title',
  long_title: 'Title over 255 characters',
  no_time: 'No time',
  no_end: 'No end time',
  bad_time: 'Ends before it starts',
  long_session: 'Over 8 hours: check am and pm',
  outside_days: 'Not one of the event’s days',
  no_room: 'No room',
  placeholder_room: 'Room is a placeholder (TBC)',
  unknown_track: 'Track not one of the event’s',
  duplicate: 'Same day, time and title as an earlier row',
  exists: 'Already on the programme',
};

export type SessionRow = {
  /** Its row in the sheet, counting the heading row as 1. */
  line: number;
  title: string;
  type: SessionType;
  description: string;
  day: number | null;
  /** "HH:MM", in the console's time, like the Add session form. */
  start: string | null;
  end: string | null;
  /** The time was blank and taken from the row above (a merged cell in the sheet). */
  timeFromAbove: boolean;
  room: string;
  track: string;
  speakers: ParsedSpeaker[];
  problem: RowProblem | null;
};

export type BuildContext = {
  editionStartsAt: string;
  /** The event's tracks and General Programme, as the Add session form offers them. */
  tracks: { value: string; label: string }[];
  /** The day for rows the sheet gives none for. */
  fallbackDay: number;
  /** The room for rows with none (breaks, often). */
  fallbackRoom: string;
  /** What the programme already has, so running a sheet again skips what went in the first time. */
  existing: Session[];
};

const PLACEHOLDER_ROOM = /^(tbc|tba|tbd|n\/a|none|-)?$/i;
const sessionKey = (day: number | null, start: string | null, title: string) => `${day}|${start}|${norm(title)}`;
const localHm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Each session in the sheet as it would be imported, with the first problem that stops it.
 *
 * A row with one cell filled is a heading ("Day Two — Thursday, October 22nd", "AFTERNOON SESSION"):
 * one that names a day sets it for the rows under it. A blank day, date or time is the row above's
 * (merged cells). A row with only speakers in it carries on the session above it.
 */
export function buildRows(table: ProgrammeTable, mapping: Mapping, ctx: BuildContext): SessionRow[] {
  const year = new Date(ctx.editionStartsAt).getFullYear();
  const cell = (r: string[], f: SessionField) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '');
  const dayIn = (text: string) => {
    const date = readDate(text, year);
    if (date) return dayOfDate(date, ctx.editionStartsAt) ?? -1;
    return readDayNumber(text);
  };
  const existing = new Set(ctx.existing.map((s) => sessionKey(s.day, localHm(s.startsAt), s.title)));
  const tracks = ctx.tracks.map((t) => ({ value: t.value, keys: [norm(t.value), norm(t.label)] }));
  const carriers: SessionField[] = ['speakers', 'moderators', 'description'];

  let day: number | null = null;
  for (const text of table.preamble) day = dayIn(text) ?? day;

  let lastTime: { start: string; end: string | null } | null = null;
  const seen = new Set<string>();
  const out: SessionRow[] = [];

  table.rows.forEach((r, i) => {
    const filled = r.map((c, idx) => (c.trim() ? idx : -1)).filter((idx) => idx >= 0);
    const onlyCarriers = filled.every((idx) => carriers.some((f) => mapping[f] === idx));
    if (filled.length === 1 && !onlyCarriers) {
      day = dayIn(r[filled[0]!]!) ?? day;
      return;
    }
    const rawTitle = cell(r, 'title');
    const rawTime = [cell(r, 'time'), cell(r, 'start'), cell(r, 'end')].filter(Boolean).join(' - ');
    const people = [...parseSpeakers(cell(r, 'speakers')), ...parseSpeakers(cell(r, 'moderators'))];
    const last = out.at(-1);

    if (!rawTitle && !rawTime && onlyCarriers) {
      if (!last) return;
      for (const p of people) {
        const tail = last.speakers.at(-1);
        if (!p.name && tail && !tail.role) Object.assign(tail, { role: p.role, organisation: p.organisation });
        else if (p.name) last.speakers.push(p);
      }
      const more = cell(r, 'description');
      if (more) last.description = [last.description, more].filter(Boolean).join(' ');
      return;
    }

    const rowDay = cell(r, 'date') ? dayIn(cell(r, 'date')) : cell(r, 'day') ? dayIn(cell(r, 'day')) : null;
    if (rowDay !== null) day = rowDay;
    const thisDay = day ?? ctx.fallbackDay;

    const { title, type: titleType } = splitTitle(rawTitle);
    const type = sessionTypeOf(cell(r, 'type')) ?? titleType ?? 'other';
    const time = rawTime ? parseTimeRange(rawTime) : null;
    const timeFromAbove = !rawTime && !!lastTime && !!title;
    const at = time ?? (timeFromAbove ? lastTime : null);
    if (time) lastTime = time;

    const room = (cell(r, 'room') || ctx.fallbackRoom).replace(/\s+/g, ' ').trim();
    const trackText = cell(r, 'track');
    const track = trackText ? (tracks.find((t) => t.keys.includes(norm(trackText)))?.value ?? null) : 'general';
    const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
    const key = sessionKey(thisDay, at?.start ?? null, title);

    let problem: RowProblem | null = null;
    if (!title) problem = 'no_title';
    else if (title.length > 255) problem = 'long_title';
    else if (!at) problem = 'no_time';
    else if (!at.end) problem = 'no_end';
    else if (minutes(at.end) <= minutes(at.start)) problem = 'bad_time';
    else if (minutes(at.end) - minutes(at.start) > 8 * 60) problem = 'long_session';
    else if (thisDay < 1 || thisDay > MAX_DAY) problem = 'outside_days';
    else if (!room) problem = 'no_room';
    else if (PLACEHOLDER_ROOM.test(room)) problem = 'placeholder_room';
    else if (!track) problem = 'unknown_track';
    else if (seen.has(key)) problem = 'duplicate';
    else if (existing.has(key)) problem = 'exists';
    if (title && at) seen.add(key);

    out.push({
      line: i + 2,
      title,
      type,
      description: cell(r, 'description').replace(/\s+/g, ' '),
      day: thisDay >= 1 && thisDay <= MAX_DAY ? thisDay : null,
      start: at?.start ?? null,
      end: at?.end ?? null,
      timeFromAbove,
      room,
      track: track ?? trackText,
      speakers: people.filter((p) => p.name),
      problem,
    });
  });
  return out;
}

/* ----------------------------------------------------------------- speakers */

export type PlannedSpeaker = {
  key: string;
  name: string;
  role: string;
  organisation: string;
  /** The speaker already on file with this name; null when the import adds them. */
  existing: Speaker | null;
  /** How many of the importable sessions name them. */
  sessions: number;
};

/**
 * Everyone the importable rows name, once each: matched to a speaker already on file by name
 * (ignoring titles such as Dr. and Prof.), or to be added, with the first role and organisation
 * the sheet gives them.
 */
export function planSpeakers(rows: SessionRow[], onFile: Speaker[]): PlannedSpeaker[] {
  const known = new Map(onFile.map((s) => [speakerKey(s.name), s]));
  const plan = new Map<string, PlannedSpeaker>();
  for (const row of rows) {
    if (row.problem) continue;
    const inRow = new Set<string>();
    for (const p of row.speakers) {
      const key = speakerKey(p.name);
      if (!key) continue;
      const was = plan.get(key) ?? { key, name: p.name, role: '', organisation: '', existing: known.get(key) ?? null, sessions: 0 };
      if (!was.role && !was.organisation) Object.assign(was, { role: p.role, organisation: p.organisation });
      if (!inRow.has(key)) was.sessions += 1;
      inRow.add(key);
      plan.set(key, was);
    }
  }
  return [...plan.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The `POST /speakers` body for someone the import adds: blanks left out, long values cut to what the API takes. */
export function toSpeakerBody(s: PlannedSpeaker) {
  return {
    name: s.name.slice(0, 255),
    ...(s.role ? { role: s.role.slice(0, 255) } : {}),
    ...(s.organisation ? { organisation: s.organisation.slice(0, 255) } : {}),
  };
}

/**
 * A ready row as one item of `POST /sessions/bulk`. Times go as UTC instants from the console's
 * clock, as the Add session form sends them. `speakerIds` maps a person's key to their id; people
 * left out of the import have none and are dropped.
 */
export function toSessionBody(row: SessionRow, editionStartsAt: string, editionId: string, speakerIds: Map<string, string>) {
  const date = dayDate(editionStartsAt, row.day!);
  const ids = [...new Set(row.speakers.map((p) => speakerIds.get(speakerKey(p.name))).filter((id): id is string => !!id))];
  return {
    title: row.title,
    description: row.description,
    type: row.type,
    track: row.track,
    day: row.day!,
    startsAt: new Date(`${date}T${row.start}`).toISOString(),
    endsAt: new Date(`${date}T${row.end}`).toISOString(),
    room: row.room.slice(0, 255),
    editionId,
    ...(ids.length ? { speakerIds: ids } : {}),
  };
}

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/* ------------------------------------------------------------------ files */

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A sheet to fill in, with two sessions showing each column. */
export function templateCsv(): string {
  return [
    ['Day', 'Start', 'End', 'Title', 'Type', 'Track', 'Room', 'Speakers', 'Moderator', 'Description'],
    ['1', '09:00', '09:30', 'Opening ceremony', 'Ceremony', '', 'Main Hall', 'Dr. Ada Okafor | Executive Director | Policy Innovation Centre', '', 'Welcome and the two days ahead.'],
    [
      '1',
      '10:00',
      '11:00',
      'Building a trusted AI ecosystem',
      'Panel',
      '',
      'Main Hall',
      'Prof. Tunde Bello | Dean | Lagos Business School; Grace Obi | Founder | DataLab',
      'Kwame Mensah | Moderator | AfDB',
      '',
    ],
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\n');
}

/** A CSV of what happened to every row, to keep with the event's records. */
export function reportCsv(rows: SessionRow[], created: Set<number>, stopped: boolean): string {
  const lines = rows.map((r) => {
    const result = created.has(r.line)
      ? 'Added'
      : r.problem === 'exists'
        ? 'Already on the programme'
        : r.problem
          ? `Not imported: ${PROBLEM_LABEL[r.problem]}`
          : stopped
            ? 'Not imported: the import stopped'
            : 'Not imported';
    return [String(r.line), r.day ? `Day ${r.day}` : '', r.start && r.end ? `${r.start}–${r.end}` : '', r.title, r.room, r.speakers.map((s) => s.name).join('; '), result].map(csvCell).join(',');
  });
  return ['Line,Day,Time,Title,Room,Speakers,Result', ...lines].join('\n');
}
