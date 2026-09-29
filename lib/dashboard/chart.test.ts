import { describe, expect, it } from 'vitest';

import { halves, niceTicks, slices } from '@/lib/dashboard/chart';

describe('halves', () => {
  it('sums the newest half against the half before it', () => {
    expect(halves([1, 2, 3, 4])).toEqual({ recent: 7, earlier: 3, days: 2 });
  });

  it('drops the oldest day of an odd-length series', () => {
    expect(halves([100, 1, 2, 3, 4])).toEqual({ recent: 7, earlier: 3, days: 2 });
  });

  it('is empty for fewer than two days', () => {
    expect(halves([5])).toEqual({ recent: 0, earlier: 0, days: 0 });
    expect(halves([])).toEqual({ recent: 0, earlier: 0, days: 0 });
  });
});

describe('niceTicks', () => {
  it('steps on round numbers and covers the maximum', () => {
    expect(niceTicks(46_000)).toEqual([0, 20_000, 40_000, 60_000]);
    expect(niceTicks(1_900_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
  });

  it('gives an all-zero or empty series a usable scale', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});

describe('slices', () => {
  it('keeps the largest rows and folds the rest into Other', () => {
    const rows = [
      { label: 'Press', value: 52 },
      { label: 'Standard', value: 1640 },
      { label: 'VIP', value: 312 },
      { label: 'Student', value: 148 },
      { label: 'Group', value: 44 },
    ];
    const out = slices(rows, 4);
    expect(out.map((s) => s.label)).toEqual(['Standard', 'VIP', 'Student', 'Other']);
    expect(out[3]).toMatchObject({ value: 96, other: true });
    expect(out.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it('does not fold when the rows already fit', () => {
    expect(slices([{ label: 'A', value: 1 }, { label: 'B', value: 3 }]).map((s) => s.label)).toEqual(['B', 'A']);
  });

  it('drops zero rows and returns nothing when there is no data', () => {
    expect(slices([{ label: 'A', value: 0 }])).toEqual([]);
  });
});
