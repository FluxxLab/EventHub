// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CARD_TINTS, CARDS_PER_SLIDE, cardGrid, commitmentOf, detailsOf, fitText, linesAt, MAX_ROWS, sessionGroups, slideCount, tablePages, whoOf } from '@/lib/calls-to-action/build-deck';
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

  it('names who said it, or leaves it blank', () => {
    expect(whoOf(call())).toContain('Amina Yusuf');
    expect(whoOf(call({ proposedBy: null, proposedByOrganisation: null }))).toBe('');
  });
});

describe('Build template pages', () => {
  it('puts five rows on a table slide', () => {
    expect(tablePages(Array.from({ length: 5 }, () => call())).map((p) => p.length)).toEqual([MAX_ROWS]);
    expect(tablePages(Array.from({ length: 12 }, () => call())).map((p) => p.length)).toEqual([5, 5, 2]);
  });

  it('moves rows to the next slide when long details would overflow it', () => {
    const long = call({ action: 'A commitment explained at length. '.repeat(12) });
    const pages = tablePages(Array.from({ length: 5 }, () => long));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(Array.from({ length: 5 }, (_, i) => i));
  });

  it('puts six cards to a slide and counts only approved calls', () => {
    const calls = [...Array.from({ length: 7 }, () => call()), call({ status: 'rejected' })];
    expect(slideCount({ title: 'S', when: '', calls }, 'cards')).toBe(2);
    expect(slideCount({ title: 'S', when: '', calls: calls.slice(0, 6) }, 'cards')).toBe(1);
    expect(CARD_TINTS.length).toBeGreaterThanOrEqual(CARDS_PER_SLIDE);
  });

  it('sizes cards to how many there are, inside the slide', () => {
    const six = cardGrid(6);
    expect(cardGrid(1)[0]!.h).toBeGreaterThan(six[0]!.h);
    for (const c of [...cardGrid(1), ...cardGrid(4), ...six]) {
      expect(c.x).toBeGreaterThanOrEqual(0.5);
      expect(c.x + c.w).toBeLessThanOrEqual(12.8);
      expect(c.y + c.h).toBeLessThanOrEqual(6.95);
    }
  });

  it('picks the largest size the text fits at', () => {
    const text = 'Set up a Nigerian GPU facility that can be connected with Gates Foundation-funded GPUs in Rwanda, Senegal and Kenya.';
    expect(fitText(text, 4, 3, [14, 12, 10]).pt).toBe(14);
    expect(fitText(text, 2, 0.6, [14, 12, 10, 8]).pt).toBeLessThan(14);
    expect(linesAt('one two three', 10, 12)).toBe(1);
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
