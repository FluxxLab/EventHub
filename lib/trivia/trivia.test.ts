import { describe, expect, it } from 'vitest';

import { correctShare, players, sortTrivia, triviaSchema, withLive, type TriviaQuestion } from '@/lib/trivia/trivia';

const q = (id: string, over: Partial<TriviaQuestion> = {}): TriviaQuestion => ({
  id,
  text: `Q ${id}`,
  optionA: 'a',
  optionB: 'b',
  optionC: 'c',
  optionD: 'd',
  correctOption: 'A',
  explanation: null,
  status: 'draft',
  createdAt: '2027-09-07T09:00:00Z',
  ...over,
});

describe('ordering and going live', () => {
  it('orders live, drafts, closed, newest first', () => {
    const sorted = sortTrivia([
      q('old-closed', { status: 'closed', createdAt: '2027-09-07T08:00:00Z' }),
      q('draft'),
      q('new-closed', { status: 'closed', createdAt: '2027-09-07T10:00:00Z' }),
      q('live', { status: 'live' }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['live', 'draft', 'new-closed', 'old-closed']);
  });

  it('closes the live question when another starts', () => {
    const next = withLive([q('a', { status: 'live' }), q('b')], 'b');
    expect(next.map((x) => [x.id, x.status])).toEqual([
      ['b', 'live'],
      ['a', 'closed'],
    ]);
  });
});

describe('results', () => {
  it('counts players and the share who got it right', () => {
    const d = { A: 6, B: 2, C: 1, D: 1 };
    expect(players(d)).toBe(10);
    expect(correctShare(d, 'A')).toBe(60);
    expect(correctShare({ A: 0, B: 0, C: 0, D: 0 }, 'A')).toBeNull();
  });
});

describe('triviaSchema', () => {
  const valid = { text: ' How many? ', optionA: '1', optionB: '2', optionC: '3', optionD: '4', correctOption: 'C' as const, explanation: '' };

  it('trims and accepts four distinct answers', () => {
    expect(triviaSchema.parse(valid).text).toBe('How many?');
  });

  it('points at a blank or repeated answer', () => {
    const blank = triviaSchema.safeParse({ ...valid, optionD: ' ' });
    expect(blank.success || blank.error.issues[0]!.path).toEqual(['optionD']);
    const repeated = triviaSchema.safeParse({ ...valid, optionD: '1' });
    expect(repeated.success || repeated.error.issues[0]!.path).toEqual(['optionD']);
  });
});
