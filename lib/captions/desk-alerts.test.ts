import { describe, expect, it } from 'vitest';

import { deskAlerts, silenceOf, type DeskRoom } from '@/lib/captions/desk-alerts';

const NOW = Date.parse('2026-10-21T14:30:00Z');
const room = (over: Partial<DeskRoom>): DeskRoom => ({
  room: 'Main Hall',
  live: { id: 's1', title: 'Opening', endsAt: '2026-10-21T15:00:00Z' },
  next: null,
  desk: { status: 'capturing', message: null },
  elsewhere: false,
  ready: true,
  silence: { level: 'ok', seconds: 0 },
  ...over,
});

describe('silence', () => {
  it('waits a minute before amber and three before red', () => {
    expect(silenceOf(NOW - 30_000, null, NOW).level).toBe('ok');
    expect(silenceOf(NOW - 90_000, null, NOW)).toEqual({ level: 'quiet', seconds: 90 });
    expect(silenceOf(NOW - 200_000, null, NOW).level).toBe('silent');
  });

  it('counts from the start when nothing has been heard, and never alarms on nothing known', () => {
    expect(silenceOf(null, NOW - 120_000, NOW).level).toBe('quiet');
    expect(silenceOf(NOW - 10_000, NOW - 600_000, NOW).level).toBe('ok');
    expect(silenceOf(null, null, NOW).level).toBe('ok');
  });
});

describe('desk alerts', () => {
  it('says nothing when every live room is captioned and talking', () => {
    expect(deskAlerts([room({})], NOW)).toEqual([]);
  });

  it('puts a live room without captions first, with the button that fixes it', () => {
    const alerts = deskAlerts(
      [
        room({ room: 'Acacia', silence: { level: 'quiet', seconds: 70 } }),
        room({ room: 'Tamarind', desk: null }),
        room({ room: 'Foyer', desk: null, ready: false }),
      ],
      NOW,
    );
    expect(alerts.map((a) => [a.room, a.severity, a.action])).toEqual([
      ['Foyer', 'critical', 'patch'],
      ['Tamarind', 'critical', 'start'],
      ['Acacia', 'warning', null],
    ]);
  });

  it('trusts a venue stream or another desk', () => {
    expect(deskAlerts([room({ desk: null, elsewhere: true })], NOW)).toEqual([]);
  });

  it('turns long silence red and reports a stopped room', () => {
    const alerts = deskAlerts([room({ silence: { level: 'silent', seconds: 240 } }), room({ room: 'B', desk: { status: 'error', message: 'Mic unplugged' } })], NOW);
    expect(alerts.map((a) => a.text)).toEqual(['B stopped: Mic unplugged', 'Main Hall: no words for 4 min. Check the mic is up and the right channel is patched.']);
    expect(alerts.every((a) => a.severity === 'critical')).toBe(true);
  });

  it('offers the switch when a session has run over and the next is due', () => {
    const over = room({ live: { id: 's1', title: 'Opening', endsAt: '2026-10-21T14:00:00Z' }, next: { id: 's2', title: 'Keynote', startsAt: '2026-10-21T14:10:00Z' } });
    expect(deskAlerts([over], NOW)).toMatchObject([{ action: 'switch', severity: 'warning' }]);
    const notYet = room({ live: { id: 's1', title: 'Opening', endsAt: '2026-10-21T14:28:00Z' }, next: { id: 's2', title: 'Keynote', startsAt: '2026-10-21T14:28:00Z' } });
    expect(deskAlerts([notYet], NOW)).toEqual([]);
  });
});
