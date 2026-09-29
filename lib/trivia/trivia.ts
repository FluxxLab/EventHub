import { z } from 'zod';

export const OPTIONS = ['A', 'B', 'C', 'D'] as const;
export type TriviaOption = (typeof OPTIONS)[number];
export type TriviaStatus = 'draft' | 'live' | 'closed';

/** `GET /trivia`: a question as organisers see it (the correct answer included). */
export type TriviaQuestion = {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: TriviaOption;
  explanation: string | null;
  status: TriviaStatus;
  createdAt: string;
};

export type Distribution = Record<TriviaOption, number>;
/** `GET /trivia/:id/stats`. */
export type TriviaStats = { questionId: string; playCount: number; distribution: Distribution };

export const EMPTY_DISTRIBUTION: Distribution = { A: 0, B: 0, C: 0, D: 0 };

export const optionText = (q: Pick<TriviaQuestion, 'optionA' | 'optionB' | 'optionC' | 'optionD'>, o: TriviaOption) => q[`option${o}`];

/** Live first, then drafts, then closed; newest first within each. */
export function sortTrivia(questions: TriviaQuestion[]): TriviaQuestion[] {
  const rank: Record<TriviaStatus, number> = { live: 0, draft: 1, closed: 2 };
  return [...questions].sort((a, b) => rank[a.status] - rank[b.status] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Starting one question closes any other live one, as the API does. */
export function withLive(questions: TriviaQuestion[], id: string): TriviaQuestion[] {
  return sortTrivia(questions.map((q) => (q.id === id ? { ...q, status: 'live' } : q.status === 'live' ? { ...q, status: 'closed' } : q)));
}

export const players = (d: Distribution) => OPTIONS.reduce((n, o) => n + d[o], 0);

/** Share of players who chose the correct answer, 0–100, or null before anyone plays. */
export function correctShare(d: Distribution, correct: TriviaOption): number | null {
  const total = players(d);
  return total === 0 ? null : Math.round((d[correct] * 100) / total);
}

/** The API's fields; the console also asks for four different answers and caps lengths it stores. */
export const triviaSchema = z
  .object({
    text: z.string().trim().min(1, 'Write the question.').max(300, 'Keep the question under 300 characters.'),
    optionA: z.string().trim().min(1, 'Fill in answer A.').max(120, 'Keep answers under 120 characters.'),
    optionB: z.string().trim().min(1, 'Fill in answer B.').max(120, 'Keep answers under 120 characters.'),
    optionC: z.string().trim().min(1, 'Fill in answer C.').max(120, 'Keep answers under 120 characters.'),
    optionD: z.string().trim().min(1, 'Fill in answer D.').max(120, 'Keep answers under 120 characters.'),
    correctOption: z.enum(OPTIONS),
    explanation: z.string().trim().max(400, 'Keep the explanation under 400 characters.'),
  })
  .superRefine((form, ctx) => {
    const seen = new Set<string>();
    for (const o of OPTIONS) {
      const value = form[`option${o}`].toLowerCase();
      if (value && seen.has(value)) ctx.addIssue({ code: 'custom', path: [`option${o}`], message: 'Two answers are the same.' });
      seen.add(value);
    }
  });
export type TriviaForm = z.input<typeof triviaSchema>;

export const emptyTrivia = (): TriviaForm => ({ text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', explanation: '' });
export const triviaFormOf = (q: TriviaQuestion): TriviaForm => ({
  text: q.text,
  optionA: q.optionA,
  optionB: q.optionB,
  optionC: q.optionC,
  optionD: q.optionD,
  correctOption: q.correctOption,
  explanation: q.explanation ?? '',
});
