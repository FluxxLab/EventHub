import { z } from 'zod';

export type PollStatus = 'draft' | 'open' | 'closed';

/** `GET /polls`: one poll as an operator sees it (counts always included for operators). */
export type Poll = {
  id: string;
  editionId: string | null;
  sessionId: string | null;
  question: string;
  options: string[];
  status: PollStatus;
  showResults: boolean;
  /** Null only in broadcasts meant for delegates while results are hidden. */
  counts: number[] | null;
  total: number;
  myVote: number | null;
  openedAt: string | null;
  closedAt: string | null;
};

/** The `polls` room's events. opened/closed carry the delegate view, so counts may be null. */
export type PollEvent =
  | { type: 'poll:opened'; payload: Poll }
  | { type: 'poll:closed'; payload: Poll }
  | { type: 'poll:results'; payload: { id: string; counts: number[]; total: number } };

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/** The API's rules (polls.dto.ts), checked first, plus one it does not have: no repeated answers. */
export const pollSchema = z
  .object({
    question: z.string().trim().min(1, 'Write the question.').max(200, 'Keep the question under 200 characters.'),
    options: z
      .array(z.string().trim().min(1, 'Fill in this answer or remove it.').max(100, 'Keep answers under 100 characters.'))
      .min(MIN_OPTIONS, `Give at least ${MIN_OPTIONS} answers.`)
      .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} answers.`),
    showResults: z.boolean(),
    sessionId: z.string().nullable(),
  })
  .superRefine((form, ctx) => {
    const seen = new Map<string, number>();
    form.options.forEach((option, i) => {
      const k = option.toLowerCase();
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['options', i], message: 'This answer is already listed.' });
      else seen.set(k, i);
    });
  });
export type PollForm = z.input<typeof pollSchema>;

export const emptyPoll = (): PollForm => ({ question: '', options: ['', ''], showResults: true, sessionId: null });
export const pollFormOf = (poll: Poll): PollForm => ({
  question: poll.question,
  options: [...poll.options],
  showResults: poll.showResults,
  sessionId: poll.sessionId,
});

/** Open first, then drafts newest first, then closed most recently closed first. */
export function sortPolls(polls: Poll[]): Poll[] {
  const rank = { open: 0, draft: 1, closed: 2 } as const;
  const t = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  return [...polls].sort((a, b) => rank[a.status] - rank[b.status] || t(b.closedAt) - t(a.closedAt));
}

/**
 * Folds a live event into the list. Broadcasts carry the delegate view, so a null tally never
 * overwrites the operator's; a poll that opens closes any other open one (the API does the same).
 */
export function applyPollEvent(polls: Poll[], event: PollEvent): Poll[] {
  const merge = (p: Poll, next: Partial<Poll>): Poll => ({ ...p, ...next, counts: next.counts ?? p.counts, myVote: p.myVote });
  switch (event.type) {
    case 'poll:results':
      return polls.map((p) => (p.id === event.payload.id ? { ...p, counts: event.payload.counts, total: event.payload.total } : p));
    case 'poll:opened': {
      const known = polls.some((p) => p.id === event.payload.id);
      const list = polls.map((p) =>
        p.id === event.payload.id ? merge(p, event.payload) : p.status === 'open' ? { ...p, status: 'closed' as const, closedAt: event.payload.openedAt } : p,
      );
      return sortPolls(known ? list : [...list, event.payload]);
    }
    case 'poll:closed':
      return sortPolls(polls.map((p) => (p.id === event.payload.id ? merge(p, event.payload) : p)));
  }
}

/** Whole-number percentages that add up to exactly 100 (largest remainder), or all 0 with no votes. */
export function shares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

/** The option(s) in the lead, or none before the first vote. Ties are all leaders. */
export function leaders(counts: number[]): number[] {
  const top = Math.max(0, ...counts);
  return top === 0 ? [] : counts.flatMap((c, i) => (c === top ? [i] : []));
}

/** "2:05" since the poll opened, for the on-air card. */
export function elapsed(openedAt: string | null, now: number): string {
  if (!openedAt) return '0:00';
  const seconds = Math.max(0, Math.floor((now - Date.parse(openedAt)) / 1000));
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}
