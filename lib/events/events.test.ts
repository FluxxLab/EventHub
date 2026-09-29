import { describe, expect, it } from 'vitest';

import { createEditionSchema, editionsCsv, sortEditions, toCreateBody, type Edition } from '@/lib/events/events';

const edition = (over: Partial<Edition>): Edition => ({
  id: over.name ?? 'x',
  name: 'Event',
  shortName: 'EV',
  startsAt: '2027-09-07T08:00:00Z',
  endsAt: '2027-09-08T17:00:00Z',
  venue: null,
  city: null,
  category: 'summits',
  status: 'draft',
  registrationOpen: false,
  isCurrent: false,
  coverImage: null,
  createdAt: '2027-01-01T00:00:00Z',
  ...over,
});

describe('sortEditions', () => {
  const list = [
    edition({ name: 'beta', startsAt: '2027-05-01T00:00:00Z', status: 'ended' }),
    edition({ name: 'Alpha', startsAt: '2027-09-01T00:00:00Z', status: 'live' }),
    edition({ name: 'gamma', startsAt: '2026-01-01T00:00:00Z', status: 'draft' }),
  ];

  it('sorts by name, ignoring case', () => {
    expect(sortEditions(list, { key: 'name', dir: 'asc' }).map((e) => e.name)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('sorts by start date both ways', () => {
    expect(sortEditions(list, { key: 'startsAt', dir: 'desc' }).map((e) => e.name)).toEqual(['Alpha', 'beta', 'gamma']);
    expect(sortEditions(list, { key: 'startsAt', dir: 'asc' }).map((e) => e.name)).toEqual(['gamma', 'beta', 'Alpha']);
  });

  it('sorts status in lifecycle order, not alphabetically', () => {
    expect(sortEditions(list, { key: 'status', dir: 'asc' }).map((e) => e.status)).toEqual(['draft', 'live', 'ended']);
  });

  it('does not change the list it was given', () => {
    const before = list.map((e) => e.name);
    sortEditions(list, { key: 'name', dir: 'asc' });
    expect(list.map((e) => e.name)).toEqual(before);
  });
});

describe('editionsCsv', () => {
  it('writes a header and quotes values that need it', () => {
    const csv = editionsCsv([edition({ name: 'Summit, "big" one', venue: 'Hall A', registrationOpen: true, isCurrent: true })]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('Name,Short name,Starts,Ends,Venue,City,Category,Status,Registration,Current');
    expect(row).toBe('"Summit, ""big"" one",EV,2027-09-07T08:00:00Z,2027-09-08T17:00:00Z,Hall A,,Summits,Draft,Open,Yes');
  });
});

describe('createEditionSchema', () => {
  const valid = {
    name: ' GS-27 Summit ',
    shortName: 'GS-27',
    startsAt: '2027-09-07T08:00',
    endsAt: '2027-09-08T17:00',
    venue: '',
    city: 'Abuja',
    category: 'summits' as const,
  };

  it('accepts a complete form and trims it', () => {
    const parsed = createEditionSchema.parse(valid);
    expect(parsed.name).toBe('GS-27 Summit');
    const body = toCreateBody(parsed);
    expect(body).not.toHaveProperty('venue');
    expect(body.city).toBe('Abuja');
    expect(body.startsAt).toBe(new Date('2027-09-07T08:00').toISOString());
  });

  it('rejects an end before the start, on the end field', () => {
    const result = createEditionSchema.safeParse({ ...valid, endsAt: '2027-09-06T08:00' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endsAt']);
  });

  it('requires a name and short name', () => {
    const result = createEditionSchema.safeParse({ ...valid, name: '  ', shortName: '' });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['name', 'shortName']);
  });
});
