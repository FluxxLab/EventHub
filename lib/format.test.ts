import { describe, expect, it } from 'vitest';

import { ago } from '@/lib/format';

describe('ago', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const before = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it('reads recent moments as words', () => {
    expect(ago(before(0), now)).toBe('Just now');
    expect(ago(before(1), now)).toBe('1 minute ago');
    expect(ago(before(59), now)).toBe('59 minutes ago');
  });

  it('rolls up to hours and days', () => {
    expect(ago(before(60), now)).toBe('1 hour ago');
    expect(ago(before(210), now)).toBe('4 hours ago');
    expect(ago(before(60 * 49), now)).toBe('2 days ago');
  });

  it('treats a clock slightly ahead of ours as now', () => {
    expect(ago(new Date(now + 30_000).toISOString(), now)).toBe('Just now');
  });
});
