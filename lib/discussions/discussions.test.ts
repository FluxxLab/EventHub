import { describe, expect, it } from 'vitest';

import { commentState, sortThreads, threadMatches, toCsv, withHidden, withKept, withShown, type ModComment, type Thread } from '@/lib/discussions/discussions';

const thread = (id: string, over: Partial<Thread> = {}): Thread => ({
  sessionId: id,
  title: `Session ${id}`,
  track: 'economic',
  type: 'panel',
  room: 'Hall A',
  comments: 0,
  flagged: 0,
  hidden: 0,
  lastAt: null,
  ...over,
});

describe('threads', () => {
  it('puts reported threads first, then recent activity, then silent ones by title', () => {
    const sorted = sortThreads([
      thread('b-silent'),
      thread('recent', { comments: 4, lastAt: '2027-09-07T11:00:00Z' }),
      thread('a-silent'),
      thread('reported', { comments: 2, flagged: 1, lastAt: '2027-09-07T09:00:00Z' }),
      thread('older', { comments: 9, lastAt: '2027-09-07T10:00:00Z' }),
    ]);
    expect(sorted.map((t) => t.sessionId)).toEqual(['reported', 'recent', 'older', 'a-silent', 'b-silent']);
  });

  it('matches title or room', () => {
    expect(threadMatches(thread('x', { title: 'Digital IDs' }), 'digital')).toBe(true);
    expect(threadMatches(thread('x', { room: 'Main Hall' }), 'main')).toBe(true);
    expect(threadMatches(thread('x'), 'budget')).toBe(false);
  });
});

describe('comments', () => {
  const c = (over: Partial<ModComment> = {}): ModComment => ({
    id: 'c1',
    sessionId: 's1',
    sessionTitle: 'S',
    authorId: 'a',
    authorName: 'Ngozi',
    authorOrganisation: null,
    body: 'Hi',
    flagged: false,
    likes: 0,
    dislikes: 0,
    hiddenAt: null,
    createdAt: '2027-09-07T10:00:00Z',
    ...over,
  });

  it('reads what a moderator has to do, hidden taking precedence over reported', () => {
    expect(commentState(c())).toBe('ok');
    expect(commentState(c({ flagged: true }))).toBe('reported');
    expect(commentState(c({ flagged: true, hiddenAt: '2027-09-07T10:05:00Z' }))).toBe('hidden');
  });

  it('keeps a reported comment, and unhides one with its report cleared', () => {
    expect(withKept([c({ flagged: true })], 'c1')[0]).toMatchObject({ flagged: false, hiddenAt: null });
    expect(withShown([c({ flagged: true, hiddenAt: '2027-09-07T10:05:00Z' })], 'c1')[0]).toMatchObject({ flagged: false, hiddenAt: null });
  });

  it('hides one comment', () => {
    const at = new Date('2027-09-07T10:30:00Z');
    expect(withHidden([c(), c({ id: 'c2' })], 'c2', at).map((x) => x.hiddenAt)).toEqual([null, at.toISOString()]);
  });
});

describe('toCsv', () => {
  it('quotes every cell, escapes quotes and joins lists', () => {
    const csv = toCsv([{ name: 'Dr. Dirisu, PIC', body: 'She said "yes"', tracks: ['gbv', 'health'] }]);
    expect(csv).toBe('\uFEFFname,body,tracks\r\n"Dr. Dirisu, PIC","She said ""yes""","gbv; health"');
    expect(toCsv([])).toBe('\uFEFF');
  });
});
