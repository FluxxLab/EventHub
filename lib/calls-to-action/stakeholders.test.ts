import { describe, expect, it } from 'vitest';

import { detailsOf } from '@/lib/calls-to-action/build-deck';
import { hereFor, openAsks, presentLine, shortOrg, type Stakeholder, type StakeholderMap } from '@/lib/calls-to-action/calls-to-action';

const org = (name: string, delegates: number, asks: string[] = [], commitments: string[] = []): Stakeholder => ({
  name,
  spellings: [name],
  delegates: Array.from({ length: delegates }, (_, i) => ({ id: `${name}-${i}`, name: `P${i}`, title: null, email: `p${i}@x.org`, admitted: i === 0 })),
  asks,
  commitments,
});

const MAP: StakeholderMap = {
  stakeholders: [org('NITDA', 3, ['c1', 'c2']), org('NCAIR', 1, ['c2'], ['p1'])],
  byCall: { c1: ['NITDA'], c2: ['NITDA', 'NCAIR'], c3: [] },
  unmatched: [],
  links: [],
};

describe('stakeholders', () => {
  it('counts the delegates here from every organisation a call concerns', () => {
    expect(hereFor(MAP, 'c1')).toEqual({ orgs: ['NITDA'], delegates: 3 });
    expect(hereFor(MAP, 'c2')).toEqual({ orgs: ['NITDA', 'NCAIR'], delegates: 4 });
  });

  it('says nothing for a call that concerns nobody here, or before the map loads', () => {
    expect(hereFor(MAP, 'c3')).toBeNull();
    expect(hereFor(MAP, 'unknown')).toBeNull();
    expect(hereFor(undefined, 'c1')).toBeNull();
  });

  it('follows up an organisation asked to act that has committed to nothing', () => {
    expect(openAsks(MAP.stakeholders[0]!)).toBe(2);
    expect(openAsks(MAP.stakeholders[1]!)).toBe(0);
  });
});

describe('stakeholders present in decks', () => {
  const map: StakeholderMap = {
    stakeholders: [org('National Information Technology Development Agency (NITDA)', 3), org('World Bank', 1), org('NCAIR', 2), org('Nobody Org', 0)],
    byCall: { one: ['World Bank'], many: ['World Bank', 'National Information Technology Development Agency (NITDA)', 'NCAIR'], none: [], empty: ['Nobody Org'] },
    unmatched: [],
    links: [],
  };

  it('writes organisations by their abbreviation, busiest first, two at most, naming no one', () => {
    expect(shortOrg('National Information Technology Development Agency (NITDA)')).toBe('NITDA');
    expect(shortOrg('World Bank')).toBe('World Bank');
    expect(presentLine(map, 'one')).toBe('World Bank (1 delegate)');
    expect(presentLine(map, 'many')).toBe('NITDA (3 delegates); NCAIR (2 delegates) and 1 more');
  });

  it('says nothing when nobody from there is here, or before the map loads', () => {
    expect(presentLine(map, 'none')).toBeNull();
    expect(presentLine(map, 'empty')).toBeNull();
    expect(presentLine(undefined, 'one')).toBeNull();
  });

  it('ends a card or table row’s details with the line', () => {
    const call = { action: 'Fund shared compute', amount: '₦2bn', deadline: '2027', present: 'NITDA (3 delegates)' };
    expect(detailsOf(call)).toBe('Fund shared compute. ₦2bn. Timeline: 2027. Stakeholders here: NITDA (3 delegates).');
    expect(detailsOf({ ...call, present: null })).toBe('Fund shared compute. ₦2bn. Timeline: 2027.');
  });
});
