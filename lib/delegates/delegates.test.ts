import { describe, expect, it } from 'vitest';

import { countByStatus, delegatesCsv, filterByStatus, paginate, statusOf, type Delegate } from '@/lib/delegates/delegates';

const delegate = (over: Partial<Delegate>): Delegate => ({
  id: 'd',
  name: 'Amina Yusuf',
  email: 'amina@example.com',
  organisation: 'PIC',
  title: 'Director',
  country: 'NG',
  accessTier: 'standard',
  tracks: ['digital'],
  interests: [],
  tags: [],
  pendingReview: false,
  flagged: false,
  createdAt: '2027-08-01T10:00:00Z',
  consentAt: '2027-08-01T10:00:00Z',
  ...over,
});

describe('statusOf', () => {
  it('treats an unclaimed ticket holder as unclaimed, whatever the review state', () => {
    expect(statusOf(delegate({ tags: ['ticket-holder'], pendingReview: true }))).toBe('unclaimed');
  });
  it('otherwise follows review', () => {
    expect(statusOf(delegate({ pendingReview: true }))).toBe('pending');
    expect(statusOf(delegate({}))).toBe('approved');
  });
});

describe('filters and counts', () => {
  const list = [delegate({ id: 'a' }), delegate({ id: 'b', pendingReview: true }), delegate({ id: 'c', tags: ['ticket-holder'] })];

  it('filters by status', () => {
    expect(filterByStatus(list, 'pending').map((d) => d.id)).toEqual(['b']);
    expect(filterByStatus(list, 'all')).toHaveLength(3);
  });
  it('counts each status', () => {
    expect(countByStatus(list)).toEqual({ pending: 1, approved: 1, unclaimed: 1 });
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 60 }, (_, i) => i);
  it('slices a page and counts pages', () => {
    expect(paginate(items, 2, 25)).toEqual({ rows: items.slice(25, 50), pages: 3, page: 2 });
  });
  it('clamps an out-of-range page and has one page when empty', () => {
    expect(paginate(items, 9, 25).page).toBe(3);
    expect(paginate([], 1)).toEqual({ rows: [], pages: 1, page: 1 });
  });
});

describe('delegatesCsv', () => {
  it('writes readable tiers and statuses, joins lists, and quotes where needed', () => {
    const [header, row] = delegatesCsv([delegate({ organisation: 'PIC, Abuja', accessTier: 'vip', tracks: ['digital', 'gbv'] })]).split('\r\n');
    expect(header?.startsWith('Name,Email,Organisation')).toBe(true);
    expect(row).toContain('"PIC, Abuja"');
    expect(row).toContain(',VIP,Approved,digital; gbv,');
  });
});
