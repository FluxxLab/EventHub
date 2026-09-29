import { describe, expect, it } from 'vitest';

import { currentDay, roomStates, totals, type BoardSession, type LiveSession } from '@/lib/live/live';

const s = (over: Partial<BoardSession>): BoardSession => ({
  id: 's',
  title: 'Session',
  day: 1,
  startsAt: '2027-09-07T09:00:00Z',
  endsAt: '2027-09-07T10:00:00Z',
  room: 'Main Hall',
  track: 'general',
  type: 'panel',
  status: 'scheduled',
  speakers: [],
  ...over,
});
const flags = { cutToBreak: false, captionsOverlay: true, signLanguageOverlay: false };

describe('currentDay', () => {
  const board = [s({ id: 'a', day: 1, startsAt: '2027-09-07T09:00:00' }), s({ id: 'b', day: 2, startsAt: '2027-09-08T09:00:00' })];
  it('picks the day whose sessions are today', () => {
    expect(currentDay(board, new Date('2027-09-08T12:00:00'))).toEqual({ day: 2, isToday: true });
  });
  it('falls back to a live day, then day 1', () => {
    expect(currentDay([...board, s({ id: 'c', day: 2, status: 'live' })], new Date('2027-01-01T12:00:00'))).toEqual({ day: 2, isToday: false });
    expect(currentDay(board, new Date('2027-01-01T12:00:00'))).toEqual({ day: 1, isToday: false });
  });
});

describe('roomStates', () => {
  const board = [
    s({ id: 'open', room: 'Main Hall', status: 'live', startsAt: '2027-09-07T09:00:00Z' }),
    s({ id: 'keynote', room: 'main hall ', startsAt: '2027-09-07T10:30:00Z' }),
    s({ id: 'panel', room: 'Hall A', startsAt: '2027-09-07T11:00:00Z' }),
    s({ id: 'tomorrow', room: 'Hall A', day: 2, startsAt: '2027-09-08T09:00:00Z' }),
  ];
  const overview: LiveSession[] = [{ id: 'open', title: 'Open', room: 'Main Hall', viewers: 120, captionListeners: 30, capturing: true, flags }];

  it('groups rooms ignoring case and spacing, live rooms first, with next up', () => {
    const rooms = roomStates(board, overview, 1, new Date('2027-09-07T09:30:00Z'));
    expect(rooms.map((r) => r.room)).toEqual(['Main Hall', 'Hall A']);
    expect(rooms[0]!.live?.metrics?.viewers).toBe(120);
    expect(rooms[0]!.next?.id).toBe('keynote');
    expect(rooms[1]!.sessions.map((x) => x.id)).toEqual(['panel']);
  });

  it('flags two live sessions in one room', () => {
    const rooms = roomStates([...board, s({ id: 'dup', room: 'Main Hall', status: 'live' })], overview, 1);
    expect(rooms[0]!.conflict).toBe(true);
  });

  it('adds up the live rooms', () => {
    expect(totals(roomStates(board, overview, 1))).toMatchObject({ liveRooms: 1, rooms: 2, viewers: 120, listeners: 30, capturing: 1, onBreak: 0 });
  });
});
