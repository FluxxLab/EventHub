/** `GET /discussions/threads`: one row per session, whether or not anyone has posted. */
export type Thread = {
  sessionId: string;
  title: string;
  track: string;
  type: string;
  room: string;
  comments: number;
  flagged: number;
  hidden: number;
  lastAt: string | null;
};

/** `GET /discussions/comments`: a comment as moderators see it (hidden and reported included). */
export type ModComment = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  authorId: string;
  authorName: string;
  authorOrganisation: string | null;
  body: string;
  flagged: boolean;
  likes: number;
  dislikes: number;
  hiddenAt: string | null;
  createdAt: string;
};

/** What a moderator needs to do about a comment. */
export type CommentState = 'hidden' | 'reported' | 'ok';
export const commentState = (c: Pick<ModComment, 'flagged' | 'hiddenAt'>): CommentState => (c.hiddenAt ? 'hidden' : c.flagged ? 'reported' : 'ok');

/** Reported comments still showing: the review queue. */
export const needsReview = (t: Pick<Thread, 'flagged' | 'hidden'>) => t.flagged;

/**
 * Threads worth a moderator's attention first: any with reports, then most recently active, then
 * the silent ones by title.
 */
export function sortThreads(threads: Thread[]): Thread[] {
  const t = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  return [...threads].sort(
    (a, b) => Number(b.flagged > 0) - Number(a.flagged > 0) || t(b.lastAt) - t(a.lastAt) || a.title.localeCompare(b.title),
  );
}

/** Case-insensitive match on a thread's session title or room. */
export const threadMatches = (thread: Thread, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || thread.title.toLowerCase().includes(q) || thread.room.toLowerCase().includes(q);
};

/** Marks a comment hidden, before the server confirms. */
export const withHidden = (comments: ModComment[], id: string, at = new Date()) =>
  comments.map((c) => (c.id === id ? { ...c, hiddenAt: at.toISOString() } : c));

/**
 * CSV from the thread export (`?format=json`), every cell quoted: names and organisations routinely
 * hold commas. Lists become "a; b". Leading BOM so Excel reads UTF-8 names correctly.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '\uFEFF';
  const columns = Object.keys(rows[0]!);
  const cell = (v: unknown) => `"${(Array.isArray(v) ? v.join('; ') : String(v ?? '')).replace(/"/g, '""')}"`;
  return `\uFEFF${[columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n')}`;
}

/** A report dismissed: the comment stays, and leaves the review queue. */
export const withKept = (comments: ModComment[], id: string) => comments.map((c) => (c.id === id ? { ...c, flagged: false } : c));

/** A hide undone: shown again, its report cleared too (the API does the same). */
export const withShown = (comments: ModComment[], id: string) => comments.map((c) => (c.id === id ? { ...c, hiddenAt: null, flagged: false } : c));
