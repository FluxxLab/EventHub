import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import PptxGenJS from 'pptxgenjs';
import { describe, expect, it } from 'vitest';

import type { CallToAction } from './calls-to-action';
import { actorOf, addDeckSlides, addSessionSlides, byline, chunk, contrast, fallbackDesign, groupCalls, overText, readable, spread, timelineOf, type DeckDesign } from './deck';

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
const EVENT = { name: 'GS-26 Gender and Inclusion Summit', shortName: 'GS-26', when: '8 – 9 Sept 2026', where: 'Abuja' };

/** Builds a deck from a design; with `out`, also saves it there (for looking at it in PowerPoint). */
async function build(design: DeckDesign, out?: string) {
  const pres = new PptxGenJS();
  addDeckSlides(pres, {
    event: EVENT,
    design,
    calls: SAMPLE,
    sessionTitle: (id) => (id ? (TITLES[id] ?? 'A removed session') : 'No session'),
    logo: { data: `image/png;base64,${readFileSync(join(process.cwd(), 'public/pic-logo.png')).toString('base64')}`, w: 428, h: 467 },
    cover: null,
  });
  const file = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  if (out) writeFileSync(out, file);
  return { slides: (pres as unknown as { slides: unknown[] }).slides.length, file };
}

describe('calls-to-action deck', () => {
  it('groups approved calls by who they call on, the most-called first', () => {
    expect(groupCalls(SAMPLE).map((g) => [g.directedAt, g.calls.length])).toEqual([
      ['Federal Ministry of Women Affairs', 4],
      ['Central Bank of Nigeria', 2],
      ['National Bureau of Statistics', 1],
      ['State Houses of Assembly', 1],
    ]);
  });

  it('names who proposed a call, and pages lists evenly', () => {
    expect(byline({ proposedBy: 'Dr Amina Bello', proposedByOrganisation: 'UN Women', alsoProposedBy: ['A', 'B'] })).toBe('Dr Amina Bello, UN Women and 2 others');
    expect(byline({ proposedBy: null, proposedByOrganisation: null, alsoProposedBy: [] })).toBeNull();
    expect(chunk([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(spread([1, 2, 3, 4], 3)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('keeps text readable whatever colours the design picks', () => {
    expect(readable('#FFFFFF', '#F5C400')).toBe('#1A1A1A'); // yellow on white does not read
    expect(readable('#002D74', '#FFFFFF')).toBe('#FFFFFF');
    expect(contrast(readable('#6B2C91', '#7A3AA0'), '#6B2C91')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps decoration off the text of content slides', () => {
    expect(overText({ x: 8.9, y: 4.5, w: 2.2, h: 2.2 })).toBe(false); // the corner
    expect(overText({ x: 7.5, y: 0.2, w: 2, h: 2 })).toBe(true); // over the titles
  });

  it("draws the event's own deck when Claude cannot design it: brand colour, every approved call", async () => {
    const design = fallbackDesign('#0E7C7B', SAMPLE);
    expect(design.palette.primary).toBe('#0E7C7B');
    expect(design.sections.flatMap((s) => s.callIds)).toHaveLength(8);
    // cover, glance, chart, 2 + 1 + 1 + 1 section slides, sessions, close
    const { slides, file } = await build(design, process.env.DECK_OUT && `${process.env.DECK_OUT}/fallback.pptx`);
    expect(slides).toBe(10);
    expect(file.length).toBeGreaterThan(10_000);
  });

  it("puts a session's calls on one slide: actor, commitment, timeline", async () => {
    expect(actorOf({ directedAt: ' Central Bank of Nigeria ' })).toBe('Central Bank of Nigeria');
    expect(timelineOf({ deadline: 'end of 2027' })).toBe('end of 2027');
    expect(timelineOf({ deadline: null })).toBe('To be agreed');
    const design = process.env.DESIGNS ? (JSON.parse(readFileSync(join(process.env.DECK_OUT!, `${process.env.DESIGNS.split(',')[0]}.json`), 'utf8')) as DeckDesign) : fallbackDesign('#6B2C91', SAMPLE);
    const pres = new PptxGenJS();
    addSessionSlides(pres, {
      event: EVENT,
      design,
      calls: SAMPLE.filter((x) => x.sessionId === 's1'),
      sessionTitle: (id) => (id ? (TITLES[id] ?? '') : ''),
      logo: { data: `image/png;base64,${readFileSync(join(process.cwd(), 'public/pic-logo.png')).toString('base64')}`, w: 428, h: 467 },
      cover: null,
      session: { title: TITLES.s1!, when: 'Day 1 · Tue 8 Sept 2026' },
    });
    expect((pres as unknown as { slides: unknown[] }).slides).toHaveLength(1);
    const file = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    if (process.env.DECK_OUT) writeFileSync(`${process.env.DECK_OUT}/session.pptx`, file);
  });

  it.runIf(!!process.env.DESIGNS)('draws designs Claude made', async () => {
    for (const name of process.env.DESIGNS!.split(',')) {
      const design = JSON.parse(readFileSync(join(process.env.DECK_OUT!, `${name}.json`), 'utf8')) as DeckDesign;
      const { slides } = await build(design, `${process.env.DECK_OUT}/${name}.pptx`);
      expect(slides).toBeGreaterThan(5);
    }
  });
});
