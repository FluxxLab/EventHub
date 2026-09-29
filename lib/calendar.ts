/**
 * Calendar arithmetic for the date-range picker, on local calendar days written as "YYYY-MM-DD"
 * keys (they sort as strings, and carry no time zone to drift across).
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The key `days` days after (or before) `key`. */
export function shiftKey(key: string, days: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

/** A month's days in Monday-first weeks, padded with nulls to whole weeks. `month` is 0–11. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(toKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function addMonths(view: { year: number; month: number }, delta: number) {
  const date = new Date(view.year, view.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export type DayRange = { start: string; end: string };

/**
 * One click in the picker: the first click (or any click once a range is complete) starts a new
 * range; the next click on or after the start ends it; a click before the start restarts there.
 */
export function pickDay(range: DayRange, day: string): DayRange {
  if (!range.start || range.end || day < range.start) return { start: day, end: '' };
  return { start: range.start, end: day };
}

/** "7 – 8 Sep 2027", "30 Sep – 2 Oct 2027", "7 Sep 2027", or "7 Sep 2027 – …" while picking. */
export function dayRangeLabel({ start, end }: DayRange): string {
  if (!start) return '';
  const full = (key: string) => fromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!end) return `${full(start)} – …`;
  if (start === end) return full(start);
  const a = fromKey(start);
  const b = fromKey(end);
  if (a.getFullYear() !== b.getFullYear()) return `${full(start)} – ${full(end)}`;
  const head = a.toLocaleDateString('en-GB', a.getMonth() === b.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${head} – ${full(end)}`;
}

/** Times of day every 30 minutes, "00:00" to "23:30". */
export const HALF_HOURS: string[] = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

/** Times of day every 15 minutes, "06:00" to "23:45": programme slots rarely start before six. */
export const QUARTER_HOURS: string[] = Array.from({ length: 72 }, (_, i) => `${pad(6 + Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
