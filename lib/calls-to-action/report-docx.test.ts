import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { fillReportXml, type RapporteurReport } from '@/lib/calls-to-action/report-docx';

const report = (over: Partial<RapporteurReport> = {}): RapporteurReport => ({
  purpose: 'How Nigeria can build the data and compute AI needs.',
  attendees: 'Bosun Tijani (Ministry of Communications); Ada Okafor (AWS Nigeria)',
  insights: [
    { insight: 'Data is the bottleneck.', whyItMatters: 'Startups cannot train models.', evidence: 'Two ministries cited closed datasets.', implications: 'Open data policy.' },
    { insight: 'Compute is costly.', whyItMatters: 'Prices are in dollars.', evidence: 'Founders cited cloud bills.', implications: 'Credits and local data centres.' },
  ],
  perspectives: ['Openness against privacy.'],
  opportunities: [],
  challenges: [{ challenge: 'Power supply', disenablers: 'Grid outages', mitigation: 'Solar for data centres', stakeholder: 'Ministry of Power' }],
  recommendations: Array.from({ length: 5 }, (_, i) => ({ recommendation: `Recommendation ${i + 1}`, owner: 'NITDA', nextStep: 'Draft', timeframe: '2027' })),
  commitments: [{ commitment: 'Compute credits for 200 startups', who: 'AWS Nigeria', timeframe: 'Not stated', followUpLead: 'PIC' }],
  synthesis: 'A practical session.\nIt matters because data decides who builds.',
  ...over,
});

const header = { event: 'Build Conference 2026', date: 'Wednesday 21 October 2026', title: "Building Africa's AI infrastructure", completedBy: 'Tolu Tella', completedOn: '21 October 2026' };

async function template(): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync('public/report/rapporteur-guide.docx'));
  return zip.file('word/document.xml')!.async('string');
}

/** The text of each table row, cells joined by " | ". */
function tableRows(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return Array.from(doc.getElementsByTagNameNS(W, 'tbl')).map((t) =>
    Array.from(t.getElementsByTagNameNS(W, 'tr')).map((tr) =>
      Array.from(tr.getElementsByTagNameNS(W, 'tc'))
        .map((tc) =>
          Array.from(tc.getElementsByTagNameNS(W, 't'))
            .map((x) => x.textContent)
            .join(''),
        )
        .join(' | '),
    ),
  );
}

describe('rapporteur report in the Word template', () => {
  it('starts at the guide and fills its header lines', async () => {
    const xml = fillReportXml(await template(), header, report());
    expect(xml).not.toContain('Rapporteur Briefing Note');
    expect(xml).toContain('Wednesday 21 October 2026');
    expect(xml).toContain("Building Africa's AI infrastructure");
    expect(xml).toContain('Bosun Tijani (Ministry of Communications)');
    expect(xml).toContain('Tolu Tella');
    expect(xml).not.toMatch(/_{5,}/);
  });

  it('fills each section, numbering rows, adding rows past three and saying when a section is empty', async () => {
    const tables = tableRows(fillReportXml(await template(), header, report()));
    expect(tables).toHaveLength(7);
    const [insights, perspectives, opportunities, , recommendations, commitments, closing] = tables;
    expect(insights).toHaveLength(3);
    expect(insights![1]).toBe('1 | Data is the bottleneck. | Startups cannot train models. | Two ministries cited closed datasets. | Open data policy.');
    expect(perspectives![1]).toBe('1 | Openness against privacy.');
    expect(opportunities!.slice(1)).toEqual([' | None recorded in this session. |  | ']);
    expect(recommendations).toHaveLength(6);
    expect(recommendations![5]).toContain('5 | Recommendation 5');
    expect(commitments![1]).toBe('1 | Compute credits for 200 startups | AWS Nigeria | Not stated | PIC');
    expect(closing![1]).toBe('A practical session.It matters because data decides who builds.');
  });

  it('keeps paragraph ids unique when rows are added', async () => {
    const xml = fillReportXml(await template(), header, report());
    const ids = [...xml.matchAll(/w14:paraId="([0-9A-F]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
