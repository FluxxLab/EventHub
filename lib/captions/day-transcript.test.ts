// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { dayCsv, daySessions, dayText } from '@/lib/captions/day-transcript';

const s = (id: string, room: string, startsAt: string, status: 'scheduled' | 'live' | 'completed' = 'completed') => ({
  id,
  title: `Session ${id}`,
  room,
  startsAt,
  endsAt: startsAt,
  status,
});

describe('day transcript', () => {
  const day = [s('b', 'Main Hall', '2026-10-21T10:00:00Z'), s('a', 'Main Hall', '2026-10-21T09:00:00Z'), s('c', 'Tamarind A', '2026-10-21T09:30:00Z'), s('d', 'main hall ', '2026-10-21T15:00:00Z', 'scheduled')];

  it('covers started sessions, by room then time, one room or all', () => {
    expect(daySessions(day, null).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(daySessions(day, 'MAIN HALL').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('heads each session and names who spoke', () => {
    const text = dayText('Build · Day 1', [
      { session: day[1]!, lines: [{ at: Date.parse('2026-10-21T09:01:00Z'), name: 'Dr. Ada', text: 'Hello all.' }] },
      { session: day[0]!, lines: [] },
    ]);
    expect(text).toContain('=== Main Hall');
    expect(text).toContain('Dr. Ada: Hello all.');
    expect(text).toContain('(no captions)');
  });

  it('writes one CSV row per line with its room and session', () => {
    const csv = dayCsv([{ session: day[2]!, lines: [{ at: Date.parse('2026-10-21T09:31:00Z'), name: null, text: 'Say "yes", please' }] }]);
    expect(csv.split('\n')).toEqual(['time,room,session,speaker,text', '2026-10-21T09:31:00.000Z,"Tamarind A","Session c","","Say ""yes"", please"']);
  });
});
