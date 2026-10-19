import { describe, expect, it } from 'vitest';

import { canControlLive, runsEvents } from '@/lib/auth/session';

describe('tier permissions', () => {
  it('identifies tiers that run events', () => {
    expect(runsEvents('admin')).toBe(true);
    expect(runsEvents('event_admin')).toBe(true);
    expect(runsEvents('session_admin')).toBe(false);
  });

  it('identifies tiers that control live sessions', () => {
    expect(canControlLive('admin')).toBe(true);
    expect(canControlLive('event_admin')).toBe(true);
    expect(canControlLive('session_admin')).toBe(true);
  });
});
