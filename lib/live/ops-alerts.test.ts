import { describe, expect, it } from 'vitest';

import type { IngestRoom } from '@/lib/ingest/ingest';
import { lateMinutes, opsProblems, overrunMinutes } from '@/lib/live/ops-alerts';

const now = new Date('2027-09-07T11:15:00Z');
const session = (over: Partial<{ id: string; title: string; room: string; endsAt: string }> = {}) => ({
  id: 's1',
  title: 'Opening plenary',
  room: 'Main Hall',
  endsAt: '2027-09-07T11:00:00Z',
  ...over,
});
const stream = (state: NonNullable<IngestRoom['stream']>['state'], over: Partial<IngestRoom> = {}): IngestRoom => ({
  room: 'Main Hall',
  stream: { id: 'IN', input: 'rtmp', url: 'rtmps://x', state, diarise: false },
  captioning: state === 'publishing' ? 'ingest' : null,
  ...over,
});

describe('overrunMinutes', () => {
  it('flags only past the grace', () => {
    expect(overrunMinutes(session({ endsAt: '2027-09-07T11:06:00Z' }), now)).toBe(0);
    expect(overrunMinutes(session(), now)).toBe(15);
  });
});

describe('opsProblems', () => {
  it('reports a session running long, once per session', () => {
    const problems = opsProblems([session()], null, now);
    expect(problems.map((p) => p.key)).toEqual(['overrun:s1']);
    expect(problems[0]!.body).toContain('Opening plenary');
  });

  it('reports an encoder error even with nothing live', () => {
    expect(opsProblems([], [stream('error')], now).map((p) => p.kind)).toEqual(['stream-error']);
  });

  it('reports a live room whose stream is silent, unless something else captions it', () => {
    const live = [session({ endsAt: '2027-09-07T12:00:00Z' })];
    expect(opsProblems(live, [stream('inactive')], now).map((p) => p.kind)).toEqual(['stream-silent']);
    expect(opsProblems(live, [stream('inactive', { captioning: 'desk' })], now)).toEqual([]);
    expect(opsProblems(live, [stream('publishing')], now)).toEqual([]);
    expect(opsProblems([], [stream('inactive')], now)).toEqual([]); // nothing live, nothing missed
  });
});

describe('late starts', () => {
  const due = (over: Record<string, string> = {}) => ({
    id: 'k1',
    title: 'Keynote',
    room: 'Hall A',
    startsAt: '2027-09-07T11:05:00Z',
    endsAt: '2027-09-07T12:00:00Z',
    status: 'scheduled',
    ...over,
  });

  it('counts minutes overdue past the grace, only while the slot lasts', () => {
    expect(lateMinutes(due({ startsAt: '2027-09-07T11:12:00Z' }), now)).toBe(0); // 3 min: within grace
    expect(lateMinutes(due(), now)).toBe(10);
    expect(lateMinutes(due({ status: 'live' }), now)).toBe(0);
    expect(lateMinutes(due({ endsAt: '2027-09-07T11:10:00Z' }), now)).toBe(0); // slot over
  });

  it('flags a late session unless its room already has something live', () => {
    expect(opsProblems([], null, now, [due()]).map((p) => p.key)).toEqual(['late:k1']);
    const overrunning = session({ room: 'Hall A', endsAt: '2027-09-07T11:10:00Z' });
    expect(opsProblems([overrunning], null, now, [due()]).map((p) => p.kind)).toEqual([]);
  });
});
