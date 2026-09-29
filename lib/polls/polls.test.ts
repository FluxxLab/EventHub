import { describe, expect, it } from 'vitest';

import { applyPollEvent, elapsed, leaders, pollSchema, shares, sortPolls, type Poll } from '@/lib/polls/polls';

const poll = (id: string, over: Partial<Poll> = {}): Poll => ({
  id,
  editionId: 'e1',
  sessionId: null,
  question: `Poll ${id}`,
  options: ['Yes', 'No'],
  status: 'draft',
  showResults: true,
  counts: [0, 0],
  total: 0,
  myVote: null,
  openedAt: null,
  closedAt: null,
  ...over,
});

describe('pollSchema', () => {
  const valid = { question: ' Which track? ', options: ['Health', ' Finance '], showResults: true, sessionId: null };

  it('trims and accepts two to six answers', () => {
    const parsed = pollSchema.parse(valid);
    expect(parsed.question).toBe('Which track?');
    expect(parsed.options).toEqual(['Health', 'Finance']);
    expect(pollSchema.safeParse({ ...valid, options: ['Only one'] }).success).toBe(false);
    expect(pollSchema.safeParse({ ...valid, options: Array.from({ length: 7 }, (_, i) => `O${i}`) }).success).toBe(false);
  });

  it('points at the empty or repeated answer', () => {
    const empty = pollSchema.safeParse({ ...valid, options: ['Health', '  '] });
    expect(empty.success || empty.error.issues[0]!.path).toEqual(['options', 1]);
    const repeated = pollSchema.safeParse({ ...valid, options: ['Health', 'health'] });
    expect(repeated.success || repeated.error.issues[0]!.message).toBe('This answer is already listed.');
  });
});

describe('applyPollEvent', () => {
  it('keeps the operator tally when a broadcast hides it', () => {
    const list = [poll('a', { status: 'open', counts: [3, 1], total: 4 })];
    const next = applyPollEvent(list, { type: 'poll:closed', payload: poll('a', { status: 'closed', counts: null, total: 4, closedAt: '2027-09-07T10:00:00Z' }) });
    expect(next[0]).toMatchObject({ status: 'closed', counts: [3, 1] });
  });

  it('closes the previous open poll when another opens, and adds a poll it did not know', () => {
    const list = [poll('a', { status: 'open' }), poll('b')];
    const next = applyPollEvent(list, { type: 'poll:opened', payload: poll('b', { status: 'open', openedAt: '2027-09-07T10:05:00Z' }) });
    expect(next.map((p) => [p.id, p.status])).toEqual([
      ['b', 'open'],
      ['a', 'closed'],
    ]);
    expect(applyPollEvent([], { type: 'poll:opened', payload: poll('c', { status: 'open' }) })).toHaveLength(1);
  });

  it('applies live results', () => {
    const next = applyPollEvent([poll('a', { status: 'open' })], { type: 'poll:results', payload: { id: 'a', counts: [5, 2], total: 7 } });
    expect(next[0]).toMatchObject({ counts: [5, 2], total: 7 });
  });
});

describe('shares, leaders, sortPolls, elapsed', () => {
  it('rounds to percentages that add up to 100', () => {
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(shares([2, 1])).toEqual([67, 33]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([7, 0, 0]).reduce((a, b) => a + b)).toBe(100);
  });

  it('finds the lead, ties included, and none before any vote', () => {
    expect(leaders([3, 5, 5])).toEqual([1, 2]);
    expect(leaders([0, 0])).toEqual([]);
  });

  it('orders open, drafts, then closed by recency', () => {
    const sorted = sortPolls([
      poll('old', { status: 'closed', closedAt: '2027-09-07T09:00:00Z' }),
      poll('draft'),
      poll('recent', { status: 'closed', closedAt: '2027-09-07T11:00:00Z' }),
      poll('live', { status: 'open' }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['live', 'draft', 'recent', 'old']);
  });

  it('shows minutes and seconds on air', () => {
    expect(elapsed('2027-09-07T10:00:00Z', Date.parse('2027-09-07T10:02:05Z'))).toBe('2:05');
    expect(elapsed(null, 0)).toBe('0:00');
  });
});
