import { describe, expect, it } from 'vitest';

import { applyVotingEvent, moveTopic, pitchSchema, sortTopics, standings, winners, type PitchEntry, type PitchTopic } from '@/lib/pitchathon/pitchathon';

const entry = (id: string, voteCount = 0): PitchEntry => ({
  id,
  topicId: 't1',
  innovatorName: `Team ${id}`,
  country: 'Nigeria',
  track: 'economic',
  description: 'A pitch.',
  voteCount,
});
const topic = (id: string, over: Partial<PitchTopic> = {}): PitchTopic => ({
  id,
  name: `Topic ${id}`,
  position: 0,
  voting: 'pending',
  result: null,
  closedAt: null,
  createdAt: '2027-09-07T09:00:00Z',
  entries: [entry('a'), entry('b'), entry('c')],
  voters: 0,
  ...over,
});

describe('applyVotingEvent', () => {
  it('applies a live tally only to an open topic, zeroing pitches the tally omits', () => {
    const list = [topic('t1', { voting: 'open', entries: [entry('a', 4), entry('b', 2), entry('c', 1)] })];
    const next = applyVotingEvent(list, { type: 'voting:tally', payload: { topicId: 't1', counts: [{ entryId: 'a', votes: 5 }], voters: 5 } });
    expect(next[0]!.entries.map((e) => e.voteCount)).toEqual([5, 0, 0]);
    expect(next[0]!.voters).toBe(5);
    const pending = [topic('t1')];
    expect(applyVotingEvent(pending, { type: 'voting:tally', payload: { topicId: 't1', counts: [{ entryId: 'a', votes: 1 }], voters: 1 } })).toEqual(pending);
  });

  it('opens, then closes with the frozen result', () => {
    let list = applyVotingEvent([topic('t1')], { type: 'voting:opened', payload: { topicId: 't1' } });
    expect(list[0]!.voting).toBe('open');
    list = applyVotingEvent(list, { type: 'voting:closed', payload: { topicId: 't1', counts: [{ entryId: 'b', votes: 9 }], voters: 9 } });
    expect(list[0]).toMatchObject({ voting: 'closed', voters: 9 });
    expect(winners(list[0]!)).toEqual(['b']);
  });
});

describe('standings and winners', () => {
  it('orders by votes, ties by presentation order', () => {
    const t = topic('t1', { entries: [entry('a', 2), entry('b', 5), entry('c', 2)] });
    expect(standings(t).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('shares a tied win, and has none before any vote or while open', () => {
    const tie = { topicId: 't1', counts: [{ entryId: 'a', votes: 3 }, { entryId: 'b', votes: 3 }], voters: 6 };
    expect(winners(topic('t1', { voting: 'closed', result: tie }))).toEqual(['a', 'b']);
    expect(winners(topic('t1', { voting: 'closed', result: { topicId: 't1', counts: [], voters: 0 } }))).toEqual([]);
    expect(winners(topic('t1', { voting: 'open', result: tie }))).toEqual([]);
  });
});

describe('moveTopic', () => {
  const list = [topic('x', { position: 0 }), topic('y', { position: 1 }), topic('z', { position: 5 })];

  it('swaps with the neighbour and renumbers cleanly, returning only changes', () => {
    expect(moveTopic(list, 'z', -1)).toEqual([
      { id: 'z', position: 1 },
      { id: 'y', position: 2 },
    ]);
    expect(moveTopic(list, 'x', -1)).toEqual([]);
    expect(sortTopics(list).map((t) => t.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('pitchSchema', () => {
  it('trims and requires a real description', () => {
    const ok = pitchSchema.parse({ innovatorName: ' SafeRide ', country: 'Ghana', track: 'security', description: 'Women-only night buses in Accra.' });
    expect(ok.innovatorName).toBe('SafeRide');
    expect(pitchSchema.safeParse({ innovatorName: 'SafeRide', country: 'Ghana', track: 'security', description: 'Buses' }).success).toBe(false);
  });
});
