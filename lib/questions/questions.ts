/** `GET /sessions/:id/questions`: one question as the API returns it. */
export type QuestionStatus = 'open' | 'answered' | 'dismissed';

export type Question = {
  id: string;
  sessionId: string;
  text: string;
  status: QuestionStatus;
  upvotes: number;
  createdAt: string;
  answeredAt: string | null;
  author: { id: string; name: string; organisation: string | null };
  mine: boolean;
  upvoted: boolean;
};

/** The socket events for a session's questions room, as the API sends them. */
export type QuestionEvent =
  | { type: 'question:new'; payload: Question }
  | { type: 'question:votes'; payload: { id: string; upvotes: number } }
  | { type: 'question:status'; payload: { id: string; status: QuestionStatus; answeredAt: string | null } }
  | { type: 'question:deleted'; payload: { id: string } };

const STATUS_RANK: Record<QuestionStatus, number> = { open: 0, answered: 1, dismissed: 2 };
const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/**
 * The API's ranking (questions.service.ts, rankQuestions), so the queue re-sorts the same way
 * when votes arrive live: open first, most upvoted then earliest asked; answered next, most
 * recently answered first; dismissed last, newest first.
 */
export function rankQuestions(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.status === 'open') return b.upvotes - a.upvotes || time(a.createdAt) - time(b.createdAt);
    if (a.status === 'answered') return time(b.answeredAt) - time(a.answeredAt) || time(b.createdAt) - time(a.createdAt);
    return time(b.createdAt) - time(a.createdAt);
  });
}

/** Folds one live event into the queue, ranked. Unknown ids are ignored; a repeated new is not added twice. */
export function applyQuestionEvent(questions: Question[], event: QuestionEvent): Question[] {
  switch (event.type) {
    case 'question:new':
      if (questions.some((q) => q.id === event.payload.id)) return questions;
      return rankQuestions([...questions, event.payload]);
    case 'question:votes':
      return rankQuestions(questions.map((q) => (q.id === event.payload.id ? { ...q, upvotes: event.payload.upvotes } : q)));
    case 'question:status':
      return rankQuestions(
        questions.map((q) => (q.id === event.payload.id ? { ...q, status: event.payload.status, answeredAt: event.payload.answeredAt } : q)),
      );
    case 'question:deleted':
      return questions.filter((q) => q.id !== event.payload.id);
  }
}

/** A status change as the moderator makes it, before the server confirms (answered is stamped now). */
export function withStatus(questions: Question[], id: string, status: QuestionStatus, now = new Date()): Question[] {
  return rankQuestions(
    questions.map((q) =>
      q.id === id ? { ...q, status, answeredAt: status === 'answered' ? (q.answeredAt ?? now.toISOString()) : null } : q,
    ),
  );
}

export type QuestionTally = { open: number; answered: number; dismissed: number; upvotes: number; askers: number };

export function tally(questions: Question[]): QuestionTally {
  const out: QuestionTally = { open: 0, answered: 0, dismissed: 0, upvotes: 0, askers: 0 };
  const askers = new Set<string>();
  for (const q of questions) {
    out[q.status] += 1;
    out.upvotes += q.upvotes;
    askers.add(q.author.id);
  }
  out.askers = askers.size;
  return out;
}

/** Case-insensitive match on the question or who asked it. */
export function matches(question: Question, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [question.text, question.author.name, question.author.organisation ?? ''].some((s) => s.toLowerCase().includes(q));
}

/** Asked in the last minute: worth a "New" marker on a busy queue. */
export const isNew = (question: Pick<Question, 'createdAt'>, now: number) => now - Date.parse(question.createdAt) < 60_000;
