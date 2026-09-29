import { describe, expect, it } from 'vitest';

import { pageItems } from '@/lib/pagination';

describe('pageItems', () => {
  it('shows every page when there are few', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('folds long runs into gaps, keeping the ends and the neighbours', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageItems(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageItems(12, 12)).toEqual([1, null, 11, 12]);
  });

  it('shows a single skipped page rather than "…"', () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
  });

  it('shows fewer numbers with no siblings, as on a phone', () => {
    expect(pageItems(6, 12, 0)).toEqual([1, null, 6, null, 12]);
  });
});
