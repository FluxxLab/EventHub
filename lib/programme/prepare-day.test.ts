// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { splitFixes } from '@/lib/programme/prepare-day';
import type { AgendaFix } from '@/lib/captions/agenda-check';

const fix = (over: Partial<AgendaFix>): AgendaFix => ({
  fromSessionId: 'qa',
  toSessionId: 'panel',
  since: '2026-10-21T11:58:00Z',
  until: '2026-10-21T12:31:00Z',
  lines: 508,
  confidence: 0.95,
  namesHeard: ['Tayo Aduloju'],
  evidence: 'Please welcome our panel',
  reason: 'The panel is introduced.',
  ...over,
});

describe('prepare the day', () => {
  it('moves only sure findings that name where the lines go', () => {
    const { auto, review } = splitFixes([fix({}), fix({ confidence: 0.8, since: 'b' }), fix({ toSessionId: null, since: 'c' })]);
    expect(auto).toHaveLength(1);
    expect(review.map((r) => r.why)).toEqual(['The AI is 80% sure; check before moving.', 'It belongs to no session (a break or housekeeping).']);
  });
});
