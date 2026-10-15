import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import PptxGenJS from 'pptxgenjs';
import { describe, expect, it } from 'vitest';

import type { CallToAction } from './calls-to-action';
import { addDeckSlides, byline, chunk, groupCalls, spread } from './deck';

let n = 0;
const call = (over: Partial<CallToAction>): CallToAction => {
  n += 1;
  return {
    id: `c${n}`,
    editionId: 'e1',
    sessionId: 's1',
    type: 'recommendation',
    action: 'Make sex-disaggregated data mandatory in every federal survey.',
    shortText: 'Make sex-disaggregated data mandatory in every federal survey',
    directedAt: 'National Bureau of Statistics',
    proposedBy: null,
    proposedByOrganisation: null,
    alsoProposedBy: [],
    deadline: null,
    amount: null,
    theme: null,
    quote: null,
    saidAt: `2026-09-08T10:${String(n).padStart(2, '0')}:00Z`,
    needsDetail: false,
    status: 'approved',
    mergedInto: null,
    source: 'ai',
    createdAt: '2026-09-08T12:00:00Z',
    updatedAt: '2026-09-08T12:00:00Z',
    ...over,
  };
};

const SAMPLE: CallToAction[] = [
  call({ proposedBy: 'Dr Amina Bello', proposedByOrganisation: 'UN Women', quote: 'Every federal survey must report by sex, or we cannot see who is left behind.' }),
  call({
    directedAt: 'Central Bank of Nigeria',
    shortText: 'Set aside 30% of SME lending for women-led businesses',
    proposedBy: 'Kemi Adeyemi',
    proposedByOrganisation: 'WIMBIZ',
    deadline: 'end of 2027',
    amount: '30% of SME lending',
  }),
  call({ directedAt: 'Central Bank of Nigeria', shortText: 'Publish quarterly figures on loans to women, by state', sessionId: 's2' }),
  call({
    directedAt: 'Federal Ministry of Women Affairs',
    type: 'pledge',
    shortText: 'Fund 500 GBV shelters across the six geopolitical zones by 2027',
    proposedBy: 'Hon. Minister',
    proposedByOrganisation: 'Federal Ministry of Women Affairs',
    deadline: '2027',
    amount: '500 shelters',
    sessionId: 's2',
  }),
  call({ directedAt: 'Federal Ministry of Women Affairs', shortText: 'Train 2,000 frontline officers to handle GBV reports with care and confidentiality', alsoProposedBy: ['Ngozi Okafor'] }),
  call({ directedAt: 'Federal Ministry of Women Affairs', shortText: 'Create one national helpline for survivors, open day and night' }),
  call({ directedAt: 'Federal Ministry of Women Affairs', shortText: 'Report on progress at the next summit' }),
  call({ directedAt: 'State Houses of Assembly', shortText: 'Domesticate the VAPP Act in the remaining states', sessionId: 's3' }),
  call({ status: 'rejected', shortText: 'Left out: rejected' }),
];
const TITLES: Record<string, string> = { s1: 'Opening plenary: data for inclusion', s2: 'Financing women-led enterprise', s3: 'Ending GBV: from law to practice' };

describe('calls-to-action deck', () => {
  it('groups approved calls by who they call on, the most-called first', () => {
    const groups = groupCalls(SAMPLE);
    expect(groups.map((g) => [g.directedAt, g.calls.length])).toEqual([
      ['Federal Ministry of Women Affairs', 4],
      ['Central Bank of Nigeria', 2],
      ['National Bureau of Statistics', 1],
      ['State Houses of Assembly', 1],
    ]);
    expect(groups.flatMap((g) => g.calls).some((c) => c.status !== 'approved')).toBe(false);
  });

  it('names who proposed a call, with the others who backed it', () => {
    expect(byline({ proposedBy: 'Dr Amina Bello', proposedByOrganisation: 'UN Women', alsoProposedBy: ['A', 'B'] })).toBe('Dr Amina Bello, UN Women and 2 others');
    expect(byline({ proposedBy: null, proposedByOrganisation: null, alsoProposedBy: [] })).toBeNull();
    expect(chunk([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(spread([1, 2, 3, 4], 3)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(spread([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('builds the deck: cover, at a glance, who is called on, a section per target, sessions, next steps', async () => {
    const pres = new PptxGenJS();
    const logo = `image/png;base64,${readFileSync(join(process.cwd(), 'public/pic-logo.png')).toString('base64')}`;
    addDeckSlides(pres, {
      event: { name: 'GS-26 Gender and Inclusion Summit', shortName: 'GS-26', when: '8 – 9 Sept 2026', where: 'Abuja' },
      calls: SAMPLE,
      sessionTitle: (id) => (id ? (TITLES[id] ?? 'A removed session') : 'No session'),
      logo,
    });
    // 1 cover + 1 glance + 1 chart + (2 + 1 + 1 + 1) sections + 1 sessions + 1 next steps
    expect((pres as unknown as { slides: unknown[] }).slides).toHaveLength(10);
    const file = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    expect(file.length).toBeGreaterThan(10_000);
    if (process.env.DECK_OUT) writeFileSync(process.env.DECK_OUT, file);
  });
});
