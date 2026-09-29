import { describe, expect, it } from 'vitest';

import { addMonths, dayRangeLabel, HALF_HOURS, monthGrid, pickDay, shiftKey } from '@/lib/calendar';

describe('monthGrid', () => {
  it('starts weeks on Monday and pads to whole weeks', () => {
    // September 2027 starts on a Wednesday and has 30 days.
    const grid = monthGrid(2027, 8);
    expect(grid.slice(0, 3)).toEqual([null, null, '2027-09-01']);
    expect(grid.length % 7).toBe(0);
    expect(grid.filter(Boolean)).toHaveLength(30);
    expect(grid.filter(Boolean).at(-1)).toBe('2027-09-30');
  });
});

describe('shiftKey / addMonths', () => {
  it('crosses month and year ends', () => {
    expect(shiftKey('2027-01-31', 1)).toBe('2027-02-01');
    expect(shiftKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(addMonths({ year: 2027, month: 11 }, 1)).toEqual({ year: 2028, month: 0 });
    expect(addMonths({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
  });
});

describe('pickDay', () => {
  it('starts, then ends, a range', () => {
    const started = pickDay({ start: '', end: '' }, '2027-09-07');
    expect(started).toEqual({ start: '2027-09-07', end: '' });
    expect(pickDay(started, '2027-09-08')).toEqual({ start: '2027-09-07', end: '2027-09-08' });
  });

  it('allows a one-day range', () => {
    expect(pickDay({ start: '2027-09-07', end: '' }, '2027-09-07')).toEqual({ start: '2027-09-07', end: '2027-09-07' });
  });

  it('restarts on a day before the start, or after a complete range', () => {
    expect(pickDay({ start: '2027-09-07', end: '' }, '2027-09-01')).toEqual({ start: '2027-09-01', end: '' });
    expect(pickDay({ start: '2027-09-07', end: '2027-09-08' }, '2027-09-20')).toEqual({ start: '2027-09-20', end: '' });
  });
});

describe('dayRangeLabel', () => {
  // Month abbreviations vary by ICU version ("Sep" / "Sept"), so read them from the runtime.
  const sep = new Date(2027, 8).toLocaleDateString('en-GB', { month: 'short' });
  const oct = new Date(2027, 9).toLocaleDateString('en-GB', { month: 'short' });

  it('shortens the shared parts', () => {
    expect(dayRangeLabel({ start: '2027-09-07', end: '2027-09-08' })).toBe(`7 – 8 ${sep} 2027`);
    expect(dayRangeLabel({ start: '2027-09-30', end: '2027-10-02' })).toBe(`30 ${sep} – 2 ${oct} 2027`);
    expect(dayRangeLabel({ start: '2027-09-07', end: '2027-09-07' })).toBe(`7 ${sep} 2027`);
    expect(dayRangeLabel({ start: '', end: '' })).toBe('');
    expect(dayRangeLabel({ start: '2027-09-07', end: '' })).toMatch(/– …$/);
  });
});

describe('HALF_HOURS', () => {
  it('covers the day in 30-minute steps', () => {
    expect(HALF_HOURS).toHaveLength(48);
    expect(HALF_HOURS[0]).toBe('00:00');
    expect(HALF_HOURS[19]).toBe('09:30');
    expect(HALF_HOURS.at(-1)).toBe('23:30');
  });
});
