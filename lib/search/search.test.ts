import { describe, expect, it } from 'vitest';

import type { Edition } from '@/lib/events/events';
import { navFor } from '@/lib/nav';
import { apiResults, groupResults, matchEvents, matchPages, score, shortcutLabel } from '@/lib/search/search';

const edition = (over: Partial<Edition>): Edition => ({
  id: 'e1',
  name: 'GS-27 Gender & Inclusion Summit',
  shortName: 'GS-27',
  startsAt: '2027-09-07T08:00:00+01:00',
  endsAt: '2027-09-08T17:00:00+01:00',
  venue: null,
  city: 'Abuja',
  category: 'summits',
  status: 'announced',
  registrationOpen: true,
  isCurrent: true,
  coverImage: null,
  createdAt: '2027-01-01T00:00:00Z',
  ...over,
});

describe('global search', () => {
  it('ranks the start of a text over a word start over anywhere', () => {
    expect(score('Ticketing', 'tick')).toBe(3);
    expect(score('Certificates & Purple Book', 'purp')).toBe(2);
    expect(score('Programme', 'gram')).toBe(1);
    expect(score('Programme', 'xyz')).toBe(0);
    expect(score('Éducation', 'edu')).toBe(3);
  });

  it("finds pages the person can open, and only those", () => {
    expect(matchPages(navFor('admin'), 'tick').map((r) => r.href)).toEqual(['/ticketing']);
    expect(matchPages(navFor('event_admin'), 'team')).toEqual([]);
    expect(matchPages(navFor('admin'), 'team')[0]).toMatchObject({ title: 'Team', href: '/team' });
    // pages match from a word's start, not anywhere
    expect(matchPages(navFor('admin'), 'am')).toEqual([]);
    expect(matchPages(navFor('admin'), 'purple').map((r) => r.href)).toEqual(['/certificates']);
    // no query: every page, as a way to jump anywhere
    expect(matchPages(navFor('session_admin'), '').map((r) => r.href)).toEqual(['/check-in', '/kiosk', '/display', '/live', '/captions', '/questions', '/polls', '/discussions']);
  });

  it('finds events by name, short name or city, newest first among equals', () => {
    const list = [edition({ id: 'old', shortName: 'GS-26', name: 'GS-26 Gender Summit', startsAt: '2026-09-08T08:00:00Z' }), edition({})];
    expect(matchEvents(list, 'gs', () => '').map((r) => r.key)).toEqual(['event:e1', 'event:old']);
    expect(matchEvents(list, 'abuja', () => '')).toHaveLength(2);
    expect(matchEvents(list, 'g', () => '')).toEqual([]);
    expect(matchEvents(list, 'gs-27', () => '')[0]!.href).toBe('/programme?edition=e1');
  });

  it("opens each API match on the page that shows it", () => {
    const rows = apiResults(
      {
        sessions: [{ id: 's1', title: 'Digital IDs & the last mile', room: 'Hall A', day: 1, startsAt: '', editionId: 'e1', editionName: 'GS-27' }],
        speakers: [{ id: 'p1', name: 'Amina Yusuf', role: 'Director', organisation: 'PIC' }],
        delegates: [{ id: 'd1', name: 'Ngozi Eze', title: null, organisation: null }],
      },
      { delegates: false },
    );
    expect(rows.session[0]).toMatchObject({ detail: 'GS-27 · Day 1 · Hall A', href: '/programme?edition=e1&day=1&q=Digital%20IDs%20%26%20the%20last%20mile' });
    expect(rows.speaker[0]).toMatchObject({ detail: 'Director, PIC', href: '/speakers?q=Amina%20Yusuf' });
    // event organisers do not get the platform-wide delegate directory
    expect(rows.delegate).toEqual([]);
  });

  it('keeps groups in reading order and drops empty ones', () => {
    const page = { key: 'p', kind: 'page' as const, title: 'Team', detail: '', href: '/team' };
    const speaker = { key: 's', kind: 'speaker' as const, title: 'Amina', detail: '', href: '/speakers' };
    const { groups, flat } = groupResults({ speaker: [speaker], event: [], page: [page] });
    expect(groups.map((g) => g.label)).toEqual(['Pages', 'Speakers']);
    expect(flat).toEqual([page, speaker]);
    expect(shortcutLabel('MacIntel')).toBe('⌘K');
    expect(shortcutLabel('Win32')).toBe('Ctrl K');
  });
});
