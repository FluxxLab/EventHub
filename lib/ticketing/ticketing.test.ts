import { describe, expect, it } from 'vitest';

import { priceModeOf, remaining, soldShare, tierFormOf, tierSchema, toTierBody, type TicketType } from '@/lib/ticketing/ticketing';

const tier = (over: Partial<TicketType>): TicketType => ({
  id: 't',
  editionId: 'e',
  name: 'Standard',
  price: 25000,
  prices: { NGN: 25000, USD: 40 },
  perks: ['Lunch'],
  section: 'General',
  capacity: 500,
  sold: 120,
  isActive: true,
  sortOrder: 0,
  ...over,
});

describe('tier maths', () => {
  it('reads the price mode', () => {
    expect(priceModeOf(tier({ price: null }))).toBe('invitation');
    expect(priceModeOf(tier({ price: 0 }))).toBe('free');
    expect(priceModeOf(tier({}))).toBe('paid');
  });

  it('counts places left, never below zero', () => {
    expect(remaining(tier({}))).toBe(380);
    expect(remaining(tier({ capacity: 100 }))).toBe(0);
    expect(remaining(tier({ capacity: null }))).toBeNull();
    expect(soldShare(tier({ capacity: 240 }))).toBe(0.5);
  });
});

describe('toTierBody', () => {
  it('round-trips a paid tier with extra currencies', () => {
    const form = tierSchema.parse({ ...tierFormOf(tier({})), extra: { USD: '40', GHS: '', KES: '5,200', ZAR: '' } });
    const body = toTierBody(form, { update: false });
    expect(body).toMatchObject({ name: 'Standard', price: 25000, prices: { USD: 40, KES: 5200 }, capacity: 500, perks: ['Lunch'], isActive: true });
  });

  it('sends free as 0 and drops other currencies', () => {
    const form = tierSchema.parse({ ...tierFormOf(tier({})), mode: 'free' });
    const body = toTierBody(form, { update: false });
    expect(body.price).toBe(0);
    expect(body).not.toHaveProperty('prices');
  });

  it('leaves the price out for a new invitation tier, and clears it on update', () => {
    const form = tierSchema.parse({ ...tierFormOf(null), name: 'VIP guests', mode: 'invitation' });
    expect(toTierBody(form, { update: false })).not.toHaveProperty('price');
    expect(toTierBody(form, { update: true }).price).toBeNull();
  });

  it('treats blank capacity as unlimited and blank section as General', () => {
    const form = tierSchema.parse({ ...tierFormOf(null), name: 'Student', price: '5000', section: '', capacity: '' });
    const body = toTierBody(form, { update: false });
    expect(body).not.toHaveProperty('capacity');
    expect(body.section).toBe('General');
  });
});

describe('tierSchema', () => {
  it('needs a price for a paid tier', () => {
    const result = tierSchema.safeParse({ ...tierFormOf(null), name: 'Standard', price: '' });
    expect(result.error?.issues[0]?.path).toEqual(['price']);
  });

  it('rejects fractions, zero capacity and too many perks', () => {
    expect(tierSchema.safeParse({ ...tierFormOf(tier({})), price: '250.50' }).success).toBe(false);
    expect(tierSchema.safeParse({ ...tierFormOf(tier({})), capacity: '0' }).success).toBe(false);
    expect(tierSchema.safeParse({ ...tierFormOf(tier({})), perks: Array.from({ length: 21 }, (_, i) => `perk ${i}`).join('\n') }).success).toBe(false);
  });
});
