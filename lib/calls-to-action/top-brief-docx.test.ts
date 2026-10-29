import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { fillTopBriefXml, footerXml, undash, type BriefItem, type TopBrief } from '@/lib/calls-to-action/top-brief-docx';

const item = (over: Partial<BriefItem> = {}): BriefItem => ({
  rank: 1,
  title: 'Map national compute capacity & open a fair access scheme.',
  detail: 'Inventory public and private compute — then open a portal.',
  whyItRanks: 'Raised in three sessions.',
  directedAt: 'Federal Government',
  raisedBy: ['Uchechukwu Arinze (Jeremiah Arinze Foundation)', 'Olayinka Iyinlokan'],
  quote: 'Access must be transparent, affordable, and accountable',
  deadline: null,
  amount: null,
  session: 'Research Presentation – Innovation Catalysis',
  pending: false,
  ...over,
});

const brief = (over: Partial<TopBrief> = {}): TopBrief => ({
  event: 'Build Conference 2026',
  read: { approved: 118, pending: 59 },
  summary: 'Compute only pays off with power and people to use it.',
  recommendations: [item(), item({ rank: 2, title: 'Make power reliable for data centres.', quote: null })],
  commitments: [item({ title: 'NCDC will use shared compute for health.', directedAt: 'NCDC', deadline: 'Next couple of weeks', pending: true })],
  honourableMentions: ['The National AI Glossary.'],
  ...over,
});

async function template(): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync('public/report/rapporteur-guide.docx'));
  return zip.file('word/document.xml')!.async('string');
}

/** The document's paragraphs as plain text. */
const paragraphs = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p')).map((p) => p.textContent ?? '');
};

describe('the top brief as Word', () => {
  it('replaces the guide with the brief, in order, keeping the page setup', async () => {
    const xml = fillTopBriefXml(await template(), brief(), '28 October 2026');
    const text = paragraphs(xml);
    expect(text[0]).toBe('Build Conference 2026');
    expect(text[1]).toBe('Top 2 Recommendations and Commitments');
    expect(text[2]).toBe('28 October 2026');
    expect(text.some((t) => t.startsWith('Prepared 28 October 2026 from 118 approved calls to action and 59 still pending review, across all sessions.'))).toBe(true);
    const order = ['Executive Summary', 'At a Glance', 'Top Recommendations', '1. Map national compute capacity & open a fair access scheme.', '2. Make power reliable for data centres.', 'Top Commitments', 'Also Worth Noting', 'About This Brief'].map((t) =>
      text.findIndex((p) => p.startsWith(t)),
    );
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
    expect(text).toContain('Raised by: Uchechukwu Arinze (Jeremiah Arinze Foundation); Olayinka Iyinlokan');
    expect(text).toContain('In their words: “Access must be transparent, affordable, and accountable”');
    expect(text).toContain('Who will act: NCDC');
    expect(text).toContain('Timeline: Next couple of weeks');
    expect(text).toContain('Session: Research Presentation: Innovation Catalysis');
    expect(text.some((t) => t.includes('(pending review)'))).toBe(true);
    // Times New Roman, justified, 1.5 spacing, and no em or en dashes anywhere
    expect(xml).toContain('w:ascii="Times New Roman"');
    expect(xml).toContain('w:jc w:val="both"');
    expect(xml).toContain('w:line="360"');
    expect(text.join(' ')).not.toMatch(/[–—]/);
    // the guide's own tables are gone; its section setup stays
    expect(xml).not.toContain('<w:tbl>');
    expect(xml).toContain('<w:sectPr');
  });

  it('puts the logo on the cover and the footer on the section when asked', async () => {
    const xml = fillTopBriefXml(await template(), brief(), '28 October 2026', { logo: { cx: 838000, cy: 914400 }, footer: true });
    expect(xml).toContain('r:embed="rIdBriefLogo"');
    expect(xml).toContain('<wp:extent cx="838000" cy="914400"/>');
    expect(xml).toMatch(/<w:footerReference[^>]*r:id="rIdBriefFooter"/);
    expect(footerXml('Build Conference 2026')).toContain('> PAGE </w:instrText>');
  });

  it('says so when a list is empty, and leaves out fields that were not given', async () => {
    const text = paragraphs(fillTopBriefXml(await template(), brief({ commitments: [], honourableMentions: [], recommendations: [item({ quote: null, session: null, directedAt: 'Not specified in transcript' })] }), '1 May 2027'));
    expect(text).toContain('No commitments were found.');
    expect(text.some((t) => t.startsWith('In their words'))).toBe(false);
    expect(text.some((t) => t.startsWith('Session:'))).toBe(false);
    expect(text.some((t) => t.startsWith('Directed at'))).toBe(false);
    expect(text).not.toContain('Also Worth Noting');
  });

  it('turns dashes into commas, keeping a hyphen in ranges', () => {
    expect(undash('Fund it — now')).toBe('Fund it, now');
    expect(undash('2026–2027')).toBe('2026-2027');
    expect(undash('ready—steady')).toBe('ready, steady');
  });
});
