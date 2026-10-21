import { describe, expect, it } from 'vitest';

import { switchTally } from '@/lib/live/use-switch';

describe('switch suggestion tally', () => {
  it('counts answered suggestions only', () => {
    expect(switchTally({ right: 9, wrong: 1, unanswered: 3 })).toBe('9 of 10 right');
    expect(switchTally({ right: 0, wrong: 0, unanswered: 2 })).toBeNull();
  });
});
