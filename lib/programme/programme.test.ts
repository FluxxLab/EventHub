import { describe, expect, it } from 'vitest';

import { createSessionSchema, dayDate, filterSessions, groupByDay, toSessionBody, typeLabel, type Session } from '@/lib/programme/programme';

const session = (over: Partial<Session>): Session => ({
  id: over.title ?? 's',
  title: 'Session',
  description: 'About it.',
  day: 1,
  startsAt: '2027-09-07T09:00:00Z',
  endsAt: '2027-09-07T10:00:00Z',
  track: 'general',
  type: 'panel',
  status: 'scheduled',
  room: 'Main Hall',
  editionId: 'e1',
  speakers: [],
  ...over,
});

describe('groupByDay', () => {
  it('groups by day, days ascending, sessions by start', () => {
    const groups = groupByDay([
      session({ title: 'b', day: 2, startsAt: '2027-09-08T11:00:00Z' }),
      session({ title: 'a', day: 1, startsAt: '2027-09-07T10:00:00Z' }),
      session({ title: 'c', day: 2, startsAt: '2027-09-08T09:00:00Z' }),
    ]);
    expect(groups.map((g) => g.day)).toEqual([1, 2]);
    expect(groups[1]!.sessions.map((s) => s.title)).toEqual(['c', 'b']);
  });
});

describe('filterSessions', () => {
  const list = [
    session({ title: 'Opening plenary', track: 'general' }),
    session({ title: 'Fintech for women', track: 'economic', room: 'Hall B', speakers: [{ id: 'x', name: 'Amina Yusuf', role: null, organisation: null, avatarUrl: null }] }),
  ];

  it('filters by track', () => {
    expect(filterSessions(list, { track: 'economic', query: '' }).map((s) => s.title)).toEqual(['Fintech for women']);
  });

  it('searches title, room and speakers, ignoring case', () => {
    expect(filterSessions(list, { track: 'all', query: 'amina' })).toHaveLength(1);
    expect(filterSessions(list, { track: 'all', query: 'hall b' })).toHaveLength(1);
    expect(filterSessions(list, { track: 'all', query: 'PLENARY' })).toHaveLength(1);
  });
});

describe('dayDate', () => {
  it('counts day 1 as the start date', () => {
    expect(dayDate('2027-09-07T08:00:00', 1)).toBe('2027-09-07');
    expect(dayDate('2027-09-30T08:00:00', 2)).toBe('2027-10-01');
  });
});

describe('typeLabel', () => {
  it('labels known types and passes unknown ones through', () => {
    expect(typeLabel('fireside')).toBe('Fireside chat');
    expect(typeLabel('hackathon')).toBe('hackathon');
  });
});

describe('createSessionSchema', () => {
  const valid = {
    title: ' Opening plenary ',
    description: 'Welcome and framing.',
    type: 'plenary' as const,
    track: 'general' as const,
    day: 1,
    date: '2027-09-07',
    startTime: '09:00',
    endTime: '10:30',
    room: '  Main   Hall ',
  };

  it('builds a body with offset-carrying instants and a tidy room', () => {
    const body = toSessionBody(createSessionSchema.parse(valid), 'e1');
    expect(body.title).toBe('Opening plenary');
    expect(body.startsAt).toBe(new Date('2027-09-07T09:00').toISOString());
    expect(body.startsAt.endsWith('Z')).toBe(true);
    expect(body.room).toBe('Main Hall');
  });

  it('refuses placeholder rooms the API would reject', () => {
    const result = createSessionSchema.safeParse({ ...valid, room: 'TBC' });
    expect(result.error?.issues[0]?.path).toEqual(['room']);
  });

  it('refuses an end at or before the start', () => {
    const result = createSessionSchema.safeParse({ ...valid, endTime: '09:00' });
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('refuses a day the API does not accept', () => {
    expect(createSessionSchema.safeParse({ ...valid, day: 3 }).success).toBe(false);
  });
});
