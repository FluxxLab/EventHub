import { describe, expect, it } from 'vitest';

import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';
import { peopleOf, renameIds, samePerson } from '@/lib/calls-to-action/names';
import { findRepeats, keeperOf, pairKey } from '@/lib/calls-to-action/repeats';

const call = (id: string, over: Partial<CallToAction>): CallToAction => ({
  id,
  editionId: 'e',
  sessionId: 's',
  type: 'pledge',
  action: '',
  shortText: '',
  directedAt: 'Public',
  proposedBy: null,
  proposedByOrganisation: null,
  alsoProposedBy: [],
  deadline: null,
  amount: null,
  theme: null,
  quote: null,
  saidAt: null,
  needsDetail: false,
  status: 'suggested',
  mergedInto: null,
  source: 'ai',
  createdAt: '2026-10-21T15:00:00Z',
  updatedAt: '2026-10-21T15:00:00Z',
  ...over,
});

describe('people on the calls', () => {
  it('groups look-alike spellings of one person, first', () => {
    const people = peopleOf([
      call('1', { proposedBy: 'Grace Obi', proposedByOrganisation: 'NBS' }),
      call('2', { proposedBy: 'Grace Obi', proposedByOrganisation: 'NBS' }),
      call('3', { proposedBy: 'Chris Agbajogo' }),
      call('4', { proposedBy: 'Christopher Agbajogu', proposedByOrganisation: 'Fluxx Eco' }),
      call('5', { proposedBy: 'Chris Ibrahim', proposedByOrganisation: 'Flux Echo' }),
      call('6', { proposedBy: 'Gone', status: 'merged' }),
    ]);
    expect(people.map((p) => p.spellings.map((s) => s.name))).toEqual([['Chris Agbajogo', 'Christopher Agbajogu'], ['Grace Obi'], ['Chris Ibrahim']]);
    expect(people[1]!.count).toBe(2);
  });

  it('renames only the calls not already spelled that way', () => {
    const [chris] = peopleOf([call('3', { proposedBy: 'Chris Agbajogo' }), call('4', { proposedBy: 'Christopher Agbajogu', proposedByOrganisation: 'Fluxx Eco' })]);
    expect(renameIds(chris!, 'Christopher Agbajogu', 'Fluxx Eco')).toEqual(['3']);
    expect(renameIds(chris!, 'Christopher Agbajogu', '')).toEqual(['3', '4']);
  });

  it('keeps different people apart', () => {
    expect(samePerson('Chris Ibrahim', 'Christopher Agbajogu')).toBe(false);
    expect(samePerson('Ibrahim Mohammed', 'Ibrahim Muhammad')).toBe(true);
  });
});

describe('repeated calls', () => {
  const tech = call('t', {
    sessionId: 'tech',
    shortText: 'Publish a public report of conference commitments, recommendations and proposals',
    action: 'Compile the synthesised commitments, recommendations, proposals and intentions captured across the conference sessions into a report that will be shared publicly.',
    saidAt: '2026-10-21T14:55:00Z',
  });
  const closing = call('c', {
    sessionId: 'closing',
    shortText: 'Publish a public report of Build 2026 commitments and recommendations',
    action: "Flux Echo will compile the conference's synthesised commitments, recommendations, proposals and intentions into a report that will be shared publicly.",
    proposedBy: 'Chris Ibrahim',
    saidAt: '2026-10-21T14:50:00Z',
  });
  const flood = call('f', {
    shortText: 'Continue developing minority-language flood warning models and advance the system towards deployment',
    action: 'Continue developing the small language models for three minority Nigerian languages spoken in flood-prone regions.',
  });
  const tulip = call('u', { shortText: 'Train future Tulip cancer-triage models on West African datasets', action: 'The Tulip team will train future versions of the Tulip breast cancer triage model on West African datasets.' });

  it('pairs the same promise made in two sessions, and nothing else', () => {
    const found = findRepeats([tech, closing, flood, tulip]);
    expect(found.map((r) => [r.a.id, r.b.id])).toEqual([['t', 'c']]);
  });

  it('leaves out pairs marked as different, and rejected or merged calls', () => {
    expect(findRepeats([tech, closing], new Set([pairKey('c', 't')]))).toEqual([]);
    expect(findRepeats([tech, { ...closing, status: 'rejected' }])).toEqual([]);
  });

  it('keeps the approved or named one', () => {
    expect(keeperOf({ a: tech, b: closing }).id).toBe('c');
    expect(keeperOf({ a: { ...tech, status: 'approved' }, b: closing }).id).toBe('t');
  });
});
