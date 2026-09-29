import { describe, expect, it, vi } from 'vitest';

import {
  appEventLink,
  dateRange,
  excerpt,
  fetchPublicEvent,
  placeLine,
  previewDescription,
  publicEventPath,
  ticketLine,
  type PublicEvent,
} from './public-event';

const EVENT: PublicEvent = {
  id: '0b6f7c1e-3d6a-4b8e-9a3c-2f1d5e7a9b10',
  name: 'GS-27 Gender and Inclusion Summit',
  shortName: 'GS-27',
  category: 'summits',
  status: 'announced',
  startsAt: '2027-09-07T07:00:00.000Z',
  endsAt: '2027-09-08T16:00:00.000Z',
  city: 'Abuja',
  venue: 'Transcorp Hilton',
  address: '1 Aguiyi Ironsi St',
  description: 'Two days on inclusion.',
  coverUrl: 'https://bucket.example/edition-covers/x?sig=1',
  registrationOpen: true,
  ticketsFrom: { amount: 15000, currency: 'NGN' },
};

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('fetchPublicEvent', () => {
  it('returns the parsed event and asks for a short revalidation', async () => {
    const fetcher = reply(200, EVENT);
    await expect(fetchPublicEvent(EVENT.id, fetcher)).resolves.toEqual({ kind: 'ok', event: EVENT });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toMatch(new RegExp(`/editions/${EVENT.id}/public$`));
    expect(init.next).toEqual({ revalidate: 60 });
  });

  it('maps 404 and 400 to not-found', async () => {
    await expect(fetchPublicEvent('x', reply(404, { message: 'Edition not found' }))).resolves.toEqual({ kind: 'not-found' });
    await expect(fetchPublicEvent('x', reply(400, {}))).resolves.toEqual({ kind: 'not-found' });
  });

  it('is unavailable when the API is down, erroring, or answers something unexpected', async () => {
    await expect(fetchPublicEvent('x', vi.fn().mockRejectedValue(new TypeError('fetch failed')))).resolves.toEqual({ kind: 'unavailable' });
    await expect(fetchPublicEvent('x', reply(503, {}))).resolves.toEqual({ kind: 'unavailable' });
    await expect(fetchPublicEvent('x', reply(200, { id: 'x' }))).resolves.toEqual({ kind: 'unavailable' });
    const notJson = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(fetchPublicEvent('x', notJson)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('encodes the id so a crafted link cannot reach another route', async () => {
    const fetcher = reply(404, {});
    await fetchPublicEvent('../delegates/me', fetcher);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/editions\/\.\.%2Fdelegates%2Fme\/public$/);
  });
});

describe('display helpers', () => {
  it('formats a multi-day range and a single day in Lagos time', () => {
    expect(dateRange(EVENT.startsAt, EVENT.endsAt)).toBe('7–8 September 2027');
    // ICU versions differ on the comma after the weekday
    expect(dateRange('2027-09-07T07:00:00Z', '2027-09-07T16:00:00Z')).toMatch(/^Tuesday,? 7 September 2027 · 08:00–17:00 WAT$/);
    expect(dateRange('nope', EVENT.endsAt)).toBe('');
  });

  it('joins venue and city without repeating one', () => {
    expect(placeLine(EVENT)).toBe('Transcorp Hilton, Abuja');
    expect(placeLine({ venue: 'Abuja', city: 'Abuja' })).toBe('Abuja');
    expect(placeLine({ venue: null, city: ' ' })).toBe('');
  });

  it('describes tickets by what can be bought', () => {
    expect(ticketLine(EVENT)).toBe('Tickets from ₦15,000');
    expect(ticketLine({ ...EVENT, ticketsFrom: { amount: 0, currency: 'NGN' } })).toBe('Free to attend');
    expect(ticketLine({ ...EVENT, ticketsFrom: null })).toBeNull();
    expect(ticketLine({ ...EVENT, registrationOpen: false })).toBe('Registration closed');
    expect(ticketLine({ ...EVENT, status: 'ended' })).toBeNull();
  });

  it('cuts long descriptions at a word', () => {
    const long = 'word '.repeat(100);
    const cut = excerpt(long, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith('word…')).toBe(true);
    expect(excerpt(null)).toBe('');
  });

  it('builds the preview line from when, where and the description', () => {
    expect(previewDescription(EVENT)).toBe('7–8 September 2027 · Transcorp Hilton, Abuja. Two days on inclusion.');
    expect(previewDescription({ ...EVENT, description: null })).toBe('7–8 September 2027 · Transcorp Hilton, Abuja');
  });

  it('matches the app: picevents://events/<id> in, /e/<id> out', () => {
    expect(appEventLink(EVENT.id)).toBe(`picevents://events/${EVENT.id}`);
    expect(publicEventPath(EVENT.id)).toBe(`/e/${EVENT.id}`);
  });
});
