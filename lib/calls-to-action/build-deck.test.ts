// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CARD_TINTS, commitmentOf, detailsOf, MAX_ROWS, sessionGroups, slideCount, tablePages, whoOf } from '@/lib/calls-to-action/build-deck';
import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';

const call = (over: Partial<CallToAction> = {}): CallToAction => ({
  id: 'c1',
  editionId: 'e1',
  sessionId: 's1',
  type: 'pledge',
  action: 'Train 1,000 young women in AI literacy',
  shortText: 'AI literacy for young women',
  directedAt: 'Federal Ministry of Education',
  proposedBy: 'Amina Yusuf',
  proposedByOrganisation: 'PIC',
  alsoProposedBy: [],
  deadline: null,
  amount: null,
  theme: null,
  quote: null,
  saidAt: null,
  needsDetail: false,
  status: 'approved',
  mergedInto: null,
  source: 'ai',
  createdAt: '2026-10-21T09:00:00Z',
  updatedAt: '2026-10-21T09:00:00Z',
  ...over,
});

describe('Build template columns', () => {
  it('heads with the short text, falling back to the action', () => {
    expect(commitmentOf(call())).toBe('AI literacy for young women');
    expect(commitmentOf(call({ shortText: ' ' }))).toBe('Train 1,000 young women in AI literacy');
  });

  it('details the action with the sum and the timeline when said', () => {
    expect(detailsOf(call())).toBe('Train 1,000 young women in AI literacy.');
    expect(detailsOf(call({ amount: '₦50 million', deadline: 'end of 2027' }))).toBe('Train 1,000 young women in AI literacy. ₦50 million. Timeline: end of 2027.');
  });

  it('names who said it, or says it was not recorded', () => {
    expect(whoOf(call())).toContain('Amina Yusuf');
    expect(whoOf(call({ proposedBy: null, proposedByOrganisation: null }))).toBe('Not recorded');
  });
});

describe('Build template pages', () => {
  it('fits up to twelve short rows on a table slide', () => {
    expect(tablePages(Array.from({ length: 12 }, () => call())).map((p) => p.length)).toEqual([MAX_ROWS]);
    expect(tablePages(Array.from({ length: 13 }, () => call())).map((p) => p.length)).toEqual([12, 1]);
  });

  it('moves rows to the next slide when long details would overflow it', () => {
    const long = call({ action: 'A commitment explained at length. '.repeat(12) });
    const pages = tablePages(Array.from({ length: 12 }, () => long));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it('puts eight cards to a slide and counts only approved calls', () => {
    const calls = [...Array.from({ length: 9 }, () => call()), call({ status: 'rejected' })];
    expect(slideCount({ title: 'S', when: '', calls }, 'cards')).toBe(2);
    expect(CARD_TINTS).toHaveLength(8);
  });
});

describe('Build template kinds', () => {
  it('shows a session’s commitments first, then its recommendations, leaving out an empty kind', () => {
    const calls = [call({ id: 'r', type: 'recommendation' }), call({ id: 'p', type: 'pledge' })];
    expect(sessionGroups({ title: 'S', when: '', calls }).map((g) => [g.kind.plural, g.calls.map((c) => c.id)])).toEqual([
      ['Commitments', ['p']],
      ['Recommendations', ['r']],
    ]);
    expect(sessionGroups({ title: 'S', when: '', calls: [call({ type: 'recommendation' })] }).map((g) => g.kind.plural)).toEqual(['Recommendations']);
  });

  it('gives each kind its own slides', () => {
    const calls = [...Array.from({ length: 3 }, () => call({ type: 'pledge' })), ...Array.from({ length: 2 }, () => call({ type: 'recommendation' }))];
    expect(slideCount({ title: 'S', when: '', calls }, 'cards')).toBe(2);
    expect(slideCount({ title: 'S', when: '', calls }, 'table')).toBe(2);
  });
});
