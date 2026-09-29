import { describe, expect, it } from 'vitest';

import { applyQuestionEvent, isNew, matches, rankQuestions, tally, withStatus, type Question } from '@/lib/questions/questions';

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  sessionId: 's1',
  text: `Question ${id}`,
  status: 'open',
  upvotes: 0,
  createdAt: '2027-09-07T10:00:00Z',
  answeredAt: null,
  author: { id: `a-${id}`, name: `Asker ${id}`, organisation: null },
  mine: false,
  upvoted: false,
  ...over,
});

describe('rankQuestions', () => {
  it('ranks as the API does: open by votes then age, answered by recency, dismissed last', () => {
    const ranked = rankQuestions([
      q('dismissed', { status: 'dismissed' }),
      q('answered-early', { status: 'answered', answeredAt: '2027-09-07T10:05:00Z' }),
      q('open-late', { upvotes: 3, createdAt: '2027-09-07T10:02:00Z' }),
      q('answered-late', { status: 'answered', answeredAt: '2027-09-07T10:09:00Z' }),
      q('open-early', { upvotes: 3, createdAt: '2027-09-07T10:01:00Z' }),
      q('open-top', { upvotes: 9 }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(['open-top', 'open-early', 'open-late', 'answered-late', 'answered-early', 'dismissed']);
  });
});

describe('applyQuestionEvent', () => {
  const queue = [q('a', { upvotes: 2 }), q('b', { upvotes: 1 })];

  it('adds a new question once, in rank', () => {
    const next = applyQuestionEvent(queue, { type: 'question:new', payload: q('c', { upvotes: 5 }) });
    expect(next.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(applyQuestionEvent(next, { type: 'question:new', payload: q('c') })).toBe(next);
  });

  it('re-ranks on votes and status, and removes on delete', () => {
    let next = applyQuestionEvent(queue, { type: 'question:votes', payload: { id: 'b', upvotes: 4 } });
    expect(next.map((x) => x.id)).toEqual(['b', 'a']);
    next = applyQuestionEvent(next, { type: 'question:status', payload: { id: 'b', status: 'answered', answeredAt: '2027-09-07T10:10:00Z' } });
    expect(next.map((x) => [x.id, x.status])).toEqual([
      ['a', 'open'],
      ['b', 'answered'],
    ]);
    expect(applyQuestionEvent(next, { type: 'question:deleted', payload: { id: 'a' } }).map((x) => x.id)).toEqual(['b']);
    expect(applyQuestionEvent(next, { type: 'question:votes', payload: { id: 'zzz', upvotes: 1 } })).toHaveLength(2);
  });
});

describe('withStatus', () => {
  it('stamps answered now, keeps an earlier stamp, and clears it on reopen', () => {
    const now = new Date('2027-09-07T10:30:00Z');
    const answered = withStatus([q('a')], 'a', 'answered', now);
    expect(answered[0]!.answeredAt).toBe(now.toISOString());
    expect(withStatus(answered, 'a', 'answered', new Date())[0]!.answeredAt).toBe(now.toISOString());
    expect(withStatus(answered, 'a', 'open')[0]!.answeredAt).toBeNull();
  });
});

describe('tally, matches, isNew', () => {
  it('counts by status, votes and distinct askers', () => {
    const list = [q('a', { upvotes: 2 }), q('b', { status: 'answered', upvotes: 3, author: { id: 'a-a', name: 'Asker a', organisation: null } }), q('c', { status: 'dismissed' })];
    expect(tally(list)).toEqual({ open: 1, answered: 1, dismissed: 1, upvotes: 5, askers: 2 });
  });

  it('matches text, asker or organisation', () => {
    const item = q('a', { text: 'How is the fund allocated?', author: { id: 'x', name: 'Ngozi Eze', organisation: 'UN Women' } });
    expect(matches(item, 'FUND')).toBe(true);
    expect(matches(item, 'ngozi')).toBe(true);
    expect(matches(item, 'un women')).toBe(true);
    expect(matches(item, 'budget')).toBe(false);
    expect(matches(item, '  ')).toBe(true);
  });

  it('marks questions from the last minute as new', () => {
    const now = Date.parse('2027-09-07T10:00:30Z');
    expect(isNew(q('a'), now)).toBe(true);
    expect(isNew(q('a'), now + 60_000)).toBe(false);
  });
});
