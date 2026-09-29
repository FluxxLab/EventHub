import { describe, expect, it } from 'vitest';

import { formatAverage, overall, rankSessions, type FeedbackRow } from '@/lib/feedback/feedback';

const row = (id: string, count: number, average: number | null): FeedbackRow => ({ sessionId: id, title: `Session ${id}`, count, average });

describe('rankSessions', () => {
  const rows = [row('a', 40, 4.2), row('b', 3, 4.9), row('c', 12, 3.1), row('d', 0, null), row('e', 20, 4.2)];

  it('orders by average, breaking ties on how many rated it, and sets unrated aside', () => {
    const { rated, unrated } = rankSessions(rows, 'best');
    expect(rated.map((r) => r.sessionId)).toEqual(['b', 'a', 'e', 'c']);
    expect(unrated.map((r) => r.sessionId)).toEqual(['d']);
    // equal averages: the one fewer people rated sits nearer the event average, so lower here
    expect(rankSessions(rows, 'worst').rated.map((r) => r.sessionId)).toEqual(['c', 'e', 'a', 'b']);
    expect(rankSessions(rows, 'most').rated.map((r) => r.sessionId)).toEqual(['a', 'e', 'c', 'b']);
  });
});

describe('rankScore', () => {
  it('keeps a handful of glowing ratings from outranking a well-rated crowd', () => {
    const rows = [row('few', 3, 4.7), row('many', 142, 4.4), row('mid', 40, 3.9)];
    expect(rankSessions(rows, 'best').rated.map((r) => r.sessionId)).toEqual(['many', 'few', 'mid']);
  });
});

describe('overall', () => {
  it('weights by ratings, not an average of averages', () => {
    const o = overall([row('a', 90, 5), row('b', 10, 1), row('c', 0, null)]);
    expect(o).toEqual({ average: 4.6, ratings: 100, rated: 2, sessions: 3 });
    expect(overall([row('x', 0, null)]).average).toBeNull();
  });

  it('formats to one decimal, with a dash when unrated', () => {
    expect(formatAverage(4.25)).toBe('4.3');
    expect(formatAverage(null)).toBe('–');
  });
});
