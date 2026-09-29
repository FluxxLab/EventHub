import { describe, expect, it } from 'vitest';

import { entriesCsv, entryFormOf, entrySchema, filterEntries, importRows, parseCsv, toEntryBody, type RegistrationEntry } from '@/lib/registration/registration';

const entry = (over: Partial<RegistrationEntry>): RegistrationEntry => ({
  id: 'r',
  email: 'amina@pic.org.ng',
  inviteCode: 'A1B2C3D4',
  name: 'Amina Yusuf',
  organisation: 'PIC',
  title: 'Director',
  assignedTier: 'vip',
  claimedAt: null,
  claimedByDelegateId: null,
  createdAt: '2027-08-01T00:00:00Z',
  ...over,
});

describe('filterEntries', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b', name: 'Tunde', email: 't@x.com', inviteCode: 'ZZZ', claimedAt: '2027-08-02T00:00:00Z' })];
  it('filters by status and searches name, email and code', () => {
    expect(filterEntries(list, { status: 'claimed', query: '' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEntries(list, { status: 'all', query: 'zzz' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEntries(list, { status: 'waiting', query: 'amina' })).toHaveLength(1);
  });
});

describe('entry form', () => {
  it('normalises email and code, and leaves a blank code out on create', () => {
    const form = entrySchema.parse({ ...entryFormOf(null), name: 'Ada', email: ' ADA@X.com ', inviteCode: '' });
    expect(toEntryBody(form, { update: false })).toEqual({ assignedTier: 'standard', name: 'Ada', email: 'ada@x.com' });
  });
  it('sends blank organisation and title on update so they clear', () => {
    const form = entrySchema.parse({ ...entryFormOf(entry({})), organisation: '', title: '' });
    expect(toEntryBody(form, { update: true })).toMatchObject({ organisation: '', title: '' });
  });
  it('needs a name or an email, and caps the code at 50', () => {
    expect(entrySchema.safeParse({ ...entryFormOf(null) }).success).toBe(false);
    expect(entrySchema.safeParse({ ...entryFormOf(null), name: 'A', inviteCode: 'X'.repeat(51) }).success).toBe(false);
  });
});

describe('CSV', () => {
  it('parses quoted cells, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('imports rows by header name, in any order, and flags bad rows with their line', () => {
    const { rows, missingHeader } = importRows('Email,Name,Tier\nada@x.com,Ada,VIP\nbad-email,Bo,\n,Cy,platinum\n');
    expect(missingHeader).toBe(false);
    expect(rows[0]).toMatchObject({ line: 2, error: null, form: { email: 'ada@x.com', name: 'Ada', assignedTier: 'vip' } });
    expect(rows[1]!.error).toMatch(/valid email/);
    expect(rows[2]!.error).toMatch(/Unknown tier/);
  });

  it('refuses a file with neither a name nor an email column', () => {
    expect(importRows('foo,bar\n1,2').missingHeader).toBe(true);
  });

  it('exports readable tiers and statuses', () => {
    const [, row] = entriesCsv([entry({ claimedAt: '2027-08-02T00:00:00Z' })]).split('\r\n');
    expect(row).toContain(',VIP,A1B2C3D4,Claimed,');
  });
});
