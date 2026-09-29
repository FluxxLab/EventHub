import { describe, expect, it } from 'vitest';

import { boardStatus, freshNotice, isOn, mostLiked, roomReaction, wallComments, wallSession, roomRows, roomsPages, lobby, lobbyPages, programmeDay, roomPages, rowState, startPage, recentNotices, roomNow, roomsOf, speakerLine, timeLeft, topQuestions } from '@/lib/display/display';
import type { ModComment } from '@/lib/discussions/discussions';
import type { BoardSession } from '@/lib/live/live';
import type { SentNotification } from '@/lib/notifications/notifications';
import type { Question } from '@/lib/questions/questions';

const NOW = new Date('2027-09-07T11:00:00');
const at = (h: number, m = 0) => new Date(`2027-09-07T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
const s = (id: string, room: string, from: [number, number], to: [number, number], status: BoardSession['status'] = 'scheduled', speakers: string[] = []): BoardSession => ({
  id,
  title: id,
  day: 1,
  startsAt: at(...from),
  endsAt: at(...to),
  room,
  track: 'General',
  type: 'Talk',
  status,
  speakers: speakers.map((name, i) => ({ id: `${id}-${i}`, name, role: null, organisation: null })),
});

describe('display boards', () => {
  const board = [
    s('plenary', 'Hall A', [10, 0], [11, 30], 'live'),
    s('panel', 'Hall B', [10, 30], [11, 15]), // nobody pressed Go live: on by its times
    s('done', 'Hall C', [10, 0], [12, 0], 'completed'),
    s('lunch', 'Hall A', [12, 0], [13, 0]),
    s('workshop', 'Hall B', [11, 30], [12, 30]),
    s('late', 'Hall C', [16, 0], [17, 0]),
  ];

  it('shows what is on in each room, and what starts in the next hours', () => {
    const view = lobby(board, NOW);
    expect(view.now.map((x) => x.id)).toEqual(['plenary', 'panel']);
    expect(view.next.map((x) => x.id)).toEqual(['workshop', 'lunch']);
    expect(isOn(board[2]!, NOW)).toBe(false);
    expect(roomsOf(board)).toEqual(['Hall A', 'Hall B', 'Hall C']);
  });

  it('follows one room: now and next today', () => {
    expect(roomNow(board, 'Hall A', NOW)).toMatchObject({ current: { id: 'plenary' }, next: { id: 'lunch' } });
    expect(roomNow(board, 'Hall C', NOW)).toMatchObject({ current: null, next: { id: 'late' } });
  });

  it('says how long is left', () => {
    expect(timeLeft(board[1]!, NOW)).toBe('15 min left');
    expect(timeLeft(s('long', 'X', [10, 0], [13, 0]), NOW)).toMatch(/^Ends 13:00$/);
    expect(timeLeft(s('over', 'X', [9, 0], [10, 50]), NOW)).toBe('Running over');
  });

  it('names speakers briefly', () => {
    expect(speakerLine(s('a', 'X', [1, 0], [2, 0], 'scheduled', ['Amina']))).toBe('Amina');
    expect(speakerLine(s('a', 'X', [1, 0], [2, 0], 'scheduled', ['Amina', 'Ngozi']))).toBe('Amina and Ngozi');
    expect(speakerLine(s('a', 'X', [1, 0], [2, 0], 'scheduled', ['A', 'B', 'C', 'D', 'E']))).toBe('A, B, C and 2 more');
  });

  it('shows recent public announcements for this event only', () => {
    const n = (id: string, hoursAgo: number, over: Partial<SentNotification> = {}): SentNotification =>
      ({ id, title: id, body: '', segment: 'all', delegateId: null, category: null, sessionId: null, linkUrl: null, editionId: null, createdAt: '', sentAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), ...over }) as SentNotification;
    const list = [n('old', 8), n('everyone', 1), n('ours', 0.5, { editionId: 'e1' }), n('other', 0.2, { editionId: 'e2' }), n('private', 0.1, { delegateId: 'd1' }), n('draft', 0, { sentAt: null })];
    expect(recentNotices(list, 'e1', NOW).map((x) => x.id)).toEqual(['ours', 'everyone']);
  });

  it('puts the most upvoted open questions up', () => {
    const q = (id: string, upvotes: number, status: Question['status'] = 'open'): Question => ({ id, sessionId: 's', text: id, status, upvotes, createdAt: at(10, upvotes), answeredAt: null, author: { id: 'a', name: 'A', organisation: null }, mine: false, upvoted: false });
    expect(topQuestions([q('a', 2), q('b', 9), q('c', 30, 'dismissed'), q('d', 50, 'answered'), q('e', 5)]).map((x) => x.id)).toEqual(['b', 'e', 'a']);
  });

  it("shows the day's programme six rows a page, opening on what is on now", () => {
    const day = programmeDay(board, NOW)!;
    expect(day.day).toBe(1);
    expect(day.sessions.map((x) => x.id)).toEqual(['plenary', 'done', 'panel', 'workshop', 'lunch', 'late']);
    expect(day.sessions.map((x) => rowState(x, NOW))).toEqual(['now', 'done', 'now', 'later', 'later', 'later']);
    const many = Array.from({ length: 8 }, (_, i) => s(`s${i}`, 'Hall A', [12 + i, 0], [12 + i, 50], i === 7 ? 'live' : 'scheduled'));
    const pages = lobbyPages(many, []);
    expect(pages.map((p) => (p.kind === 'programme' ? `${p.rows.length}:${p.part}/${p.parts}` : p.kind))).toEqual(['6:1/2', '2:2/2']);
    expect(startPage(pages, NOW)).toBe(1);
    expect(lobbyPages([], [])).toEqual([{ kind: 'empty' }]);
    expect(programmeDay([], NOW)).toBeNull();
  });

  it('keeps an open poll on a room board; otherwise cycles session, questions and next', () => {
    expect(roomPages({ hasSession: true, pollOpen: true, questions: 3, hasNext: true })).toEqual([{ kind: 'poll' }]);
    expect(roomPages({ hasSession: true, pollOpen: false, questions: 3, hasNext: true }).map((p) => p.kind)).toEqual(['session', 'questions', 'next']);
    expect(roomPages({ hasSession: true, pollOpen: false, questions: 0, hasNext: false }).map((p) => p.kind)).toEqual(['session']);
    expect(roomPages({ hasSession: false, pollOpen: false, questions: 0, hasNext: false }).map((p) => p.kind)).toEqual(['next']);
  });

  it("says each session's status as a departures board would", () => {
    expect(boardStatus(board[0]!, NOW)).toEqual({ label: 'On now', tone: 'green' });
    expect(boardStatus(s('over', 'X', [9, 0], [10, 50], 'live'), NOW)).toEqual({ label: 'Running over', tone: 'yellow' });
    expect(boardStatus(s('soon', 'X', [11, 10], [12, 0]), NOW)).toEqual({ label: 'Starting soon', tone: 'yellow' });
    expect(boardStatus(board[3]!, NOW)).toEqual({ label: 'Upcoming', tone: 'blue' });
    expect(boardStatus(board[2]!, NOW)).toEqual({ label: 'Ended', tone: 'dim' });
  });

  it('gives each room its own row: on now and up next', () => {
    const rows = roomRows(board, NOW);
    expect(rows.map((r) => [r.room, r.now?.id ?? null, r.next?.id ?? null])).toEqual([
      ['Hall A', 'plenary', 'lunch'],
      ['Hall B', 'panel', 'workshop'],
      ['Hall C', null, 'late'],
    ]);
    const many = Array.from({ length: 7 }, (_, i) => ({ room: `R${i}`, now: null, next: null }));
    expect(roomsPages(many, []).map((p) => (p.kind === 'rooms' ? `${p.rows.length}:${p.part}/${p.parts}` : p.kind))).toEqual(['6:1/2', '1:2/2']);
    expect(roomsPages([], [])).toEqual([{ kind: 'empty' }]);
  });

  it('spots an announcement sent in the last two minutes', () => {
    const n = (id: string, minutesAgo: number) => ({ id, sentAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() }) as SentNotification;
    expect(freshNotice([n('new', 1), n('older', 30)], NOW)?.id).toBe('new');
    expect(freshNotice([n('older', 3)], NOW)).toBeNull();
    expect(freshNotice([], NOW)).toBeNull();
  });

  it("follows a room's session for its discussion wall", () => {
    expect(wallSession(board, 'Hall A', NOW)?.id).toBe('plenary');
    // nothing on in Hall C: its last session so far today stays up (the completed one)
    expect(wallSession(board, 'Hall C', NOW)?.id).toBe('done');
    const early = new Date('2027-09-07T08:00:00');
    expect(wallSession(board, 'Hall C', early)?.id).toBe('late'); // before anything today: the next one
    expect(wallSession(board, 'Nowhere', NOW)).toBeNull();
  });

  it('puts only comments still showing on the wall, and reads the room reaction', () => {
    const c = (id: string, minutesAgo: number, likes: number, dislikes = 0, over: Partial<ModComment> = {}) =>
      ({ id, likes, dislikes, flagged: false, hiddenAt: null, createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(), ...over }) as ModComment;
    const list = [c('old', 30, 20, 2), c('new', 1, 0, 1), c('mid', 10, 5), c('reported', 0, 50, 0, { flagged: true }), c('hidden', 0, 90, 0, { hiddenAt: at(10) })];
    expect(wallComments(list).map((x) => x.id)).toEqual(['new', 'mid', 'old']);
    expect(mostLiked(list).map((x) => x.id)).toEqual(['old', 'mid']);
    expect(roomReaction(list)).toEqual({ likes: 25, dislikes: 3, positive: 89 });
    expect(roomReaction([])).toEqual({ likes: 0, dislikes: 0, positive: null });
  });
});
