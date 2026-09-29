import { describe, expect, it } from 'vitest';

import { detailsOf, eventsCsv, GROUPS, groupOf, periodFrom, tierLabel, typeLabel, type SecurityEvent } from '@/lib/security/security';

describe('security log', () => {
  it('names event types and roles in plain words', () => {
    expect(typeLabel('session_deleted')).toBe('Session deleted');
    expect(typeLabel('cut-to-break')).toBe('Cut to break');
    expect(tierLabel('session_admin')).toBe('Session operator');
    expect(tierLabel('something_new')).toBe('something new');
  });

  it('files every type under one kind only', () => {
    const all = Object.values(GROUPS).flatMap((g) => g.types as readonly string[]);
    expect(new Set(all).size).toBe(all.length);
    expect(groupOf('refresh_token_reuse')).toBe('access');
    expect(groupOf('comment_hidden')).toBe('moderation');
    expect(groupOf('brand_new_type')).toBeNull();
  });

  it('starts "today" at midnight at the venue', () => {
    // 23:30 UTC is already 00:30 the next day in Lagos
    expect(periodFrom('today', Date.parse('2027-09-07T23:30:00Z'))).toBe('2027-09-07T23:00:00.000Z');
    expect(periodFrom('7', Date.parse('2027-09-08T00:00:00Z'))).toBe('2027-09-01T00:00:00.000Z');
    expect(periodFrom('any', 0)).toBeUndefined();
  });

  it('reads request details as fields, leaving out empty ones', () => {
    expect(detailsOf({ params: { id: 's1' }, body: { tier: 'vip', note: '', tags: ['a', 'b'] } })).toEqual([
      { label: 'Id', value: 's1' },
      { label: 'Tier', value: 'vip' },
      { label: 'Tags', value: 'a, b' },
    ]);
    expect(detailsOf({ reportedId: 'd9', reason: 'spam' })).toEqual([
      { label: 'Reported id', value: 'd9' },
      { label: 'Reason', value: 'spam' },
    ]);
    expect(detailsOf(null)).toEqual([]);
  });

  it('exports what is on screen, saying who when the account is gone', () => {
    const base: SecurityEvent = {
      id: '1',
      type: 'tier_changed',
      description: 'Access tier changed, "VIP"',
      severity: 'warning',
      actionId: 'a1',
      metadata: { body: { tier: 'vip' } },
      createdAt: '2027-09-08T10:00:00.000Z',
      actor: { id: 'a1', name: 'Amina Yusuf', email: 'amina@pic.org.ng', tier: 'admin' },
    };
    const csv = eventsCsv([base, { ...base, id: '2', actor: null }, { ...base, id: '3', actor: null, actionId: null }]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('2027-09-08T10:00:00.000Z,Warning,Tier changed,"Access tier changed, ""VIP""",Amina Yusuf,amina@pic.org.ng,Organiser,Tier: vip');
    expect(lines[2]).toContain('Deleted account');
    expect(lines[3]).toContain('No one signed in');
  });
});
