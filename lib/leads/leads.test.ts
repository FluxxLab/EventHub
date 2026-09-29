import { describe, expect, it } from 'vitest';

import { keyFromHash, leadsCsv, ratingCounts, scannerLink, type Lead } from '@/lib/leads/leads';

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1',
  boothId: 'b1',
  name: 'Ngozi Eze',
  title: 'Director',
  organisation: 'Women in Policy, Africa',
  email: 'ngozi@x.org',
  country: 'Nigeria',
  tier: 'VIP',
  note: 'Wants a "demo"',
  rating: 'hot',
  createdAt: '2027-09-07T10:15:00Z',
  updatedAt: '2027-09-07T10:15:00Z',
  ...over,
});

const KEY = '11111111-1111-4111-8111-111111111111.AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('lead capture', () => {
  it('reads the stand key from the link, and nothing else', () => {
    expect(keyFromHash(`#${KEY}`)).toBe(KEY);
    expect(keyFromHash('#11111111-1111-4111-8111-111111111111.short')).toBeNull();
    expect(keyFromHash('')).toBeNull();
    expect(keyFromHash('#<script>')).toBeNull();
    expect(scannerLink('https://console.pic.org', KEY)).toBe(`https://console.pic.org/exhibit#${KEY}`);
  });

  it('exports leads as CSV, quoting commas and quotes', () => {
    const csv = leadsCsv([lead(), lead({ id: 'l2', title: null, rating: null, note: null })], () => 'Kora Health');
    const [head, first, second] = csv.split('\n');
    expect(head).toBe('Stand,Name,Job title,Organisation,Email,Country,Ticket,Interest,Note,Scanned at');
    expect(first).toBe('Kora Health,Ngozi Eze,Director,"Women in Policy, Africa",ngozi@x.org,Nigeria,VIP,Hot,"Wants a ""demo""",2027-09-07 10:15');
    expect(second).toBe('Kora Health,Ngozi Eze,,"Women in Policy, Africa",ngozi@x.org,Nigeria,VIP,,,2027-09-07 10:15');
    expect(leadsCsv([lead()]).startsWith('Name,')).toBe(true);
  });

  it('counts leads by interest', () => {
    expect(ratingCounts([lead(), lead({ rating: 'cold' }), lead({ rating: null })])).toEqual({ hot: 1, warm: 0, cold: 1, unrated: 1 });
  });
});
