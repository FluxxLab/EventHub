/** `GET /feedback/summary?editionId=`: one row per session, average null when nobody rated it. */
export type FeedbackRow = { sessionId: string; title: string; count: number; average: number | null };

export type Stars = 1 | 2 | 3 | 4 | 5;
export const STARS: Stars[] = [5, 4, 3, 2, 1];

/** `GET /sessions/:id/feedback`. */
export type SessionFeedback = {
  count: number;
  average: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  comments: { rating: number; comment: string; createdAt: string }[];
};

export type SortMode = 'best' | 'worst' | 'most';
export const SORT_LABEL: Record<SortMode, string> = { best: 'Highest rated', worst: 'Lowest rated', most: 'Most ratings' };

/**
 * The score sessions are ranked by: the average pulled towards the event-wide average by
 * PRIOR_WEIGHT imaginary votes (a Bayesian average). Three 5-star votes then no longer outrank a
 * session 140 people rated 4.4; the number shown is still the real average.
 */
export function rankScore(row: FeedbackRow, eventAverage: number): number {
  if (!row.count || row.average === null) return eventAverage;
  return (row.average * row.count + eventAverage * PRIOR_WEIGHT) / (row.count + PRIOR_WEIGHT);
}

/**
 * Rated sessions in the chosen order (by rank score for best and worst); ties break on how many
 * rated it, then title. Unrated sessions are returned separately.
 */
export function rankSessions(rows: FeedbackRow[], mode: SortMode): { rated: FeedbackRow[]; unrated: FeedbackRow[] } {
  const mean = overall(rows).average ?? 0;
  const rated = rows.filter((r) => r.count > 0 && r.average !== null);
  const unrated = rows.filter((r) => !(r.count > 0 && r.average !== null)).sort((a, b) => a.title.localeCompare(b.title));
  const byTitle = (a: FeedbackRow, b: FeedbackRow) => a.title.localeCompare(b.title);
  rated.sort((a, b) => {
    if (mode === 'most') return b.count - a.count || b.average! - a.average! || byTitle(a, b);
    const diff = mode === 'best' ? rankScore(b, mean) - rankScore(a, mean) : rankScore(a, mean) - rankScore(b, mean);
    return diff || b.count - a.count || byTitle(a, b);
  });
  return { rated, unrated };
}

/** The event-wide average, weighted by each session's number of ratings (not an average of averages). */
export function overall(rows: FeedbackRow[]): { average: number | null; ratings: number; rated: number; sessions: number } {
  let sum = 0;
  let ratings = 0;
  let rated = 0;
  for (const r of rows) {
    if (r.count > 0 && r.average !== null) {
      sum += r.average * r.count;
      ratings += r.count;
      rated += 1;
    }
  }
  return { average: ratings ? Math.round((sum / ratings) * 100) / 100 : null, ratings, rated, sessions: rows.length };
}

/** "4.3" for display; one decimal is as precise as a star rating deserves. */
export const formatAverage = (average: number | null) => (average === null ? '–' : average.toFixed(1));

/** How many imaginary event-average votes each session starts with when ranking. */
export const PRIOR_WEIGHT = 10;

/** A few ratings say little; flag averages resting on fewer than this. */
export const FEW_RATINGS = 5;
