import { describe, expect, it } from 'vitest';

import { removalBlocker, staffSchema, temporaryPassword, type StaffMember } from '@/lib/team/team';

const member = (over: Partial<StaffMember>): StaffMember => ({ id: 'm', name: 'Ada', email: 'ada@pic.org.ng', accessTier: 'admin', createdAt: '2027-01-01T00:00:00Z', ...over });

describe('staffSchema', () => {
  it('normalises the email and accepts a valid member', () => {
    const parsed = staffSchema.parse({ name: ' Ada Okafor ', email: ' Ada@PIC.org.ng ', password: 'abcd-efgh', role: 'session_admin' });
    expect(parsed).toMatchObject({ name: 'Ada Okafor', email: 'ada@pic.org.ng' });
  });
  it('rejects a bad email and a short password', () => {
    expect(staffSchema.safeParse({ name: 'Ada', email: 'nope', password: 'abcd-efgh', role: 'admin' }).success).toBe(false);
    expect(staffSchema.safeParse({ name: 'Ada', email: 'a@b.co', password: 'short', role: 'admin' }).success).toBe(false);
  });
});

describe('temporaryPassword', () => {
  it('is three blocks of four, long enough for the API, with no look-alikes', () => {
    const pw = temporaryPassword();
    expect(pw).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(pw).not.toMatch(/[0O1lI]/);
    expect(pw.length).toBeGreaterThanOrEqual(8);
  });
});

describe('removalBlocker', () => {
  const staff = [member({ id: 'a' }), member({ id: 'b', accessTier: 'session_admin' })];
  it('blocks removing yourself and the last organiser', () => {
    expect(removalBlocker(staff[0]!, staff, 'a')).toMatch(/your own/);
    expect(removalBlocker(staff[0]!, staff, 'z')).toMatch(/last organiser/);
  });
  it('allows removing a session operator', () => {
    expect(removalBlocker(staff[1]!, staff, 'a')).toBeNull();
  });
});
