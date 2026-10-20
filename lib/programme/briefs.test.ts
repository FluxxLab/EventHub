import { describe, expect, it } from 'vitest';

import { briefFileProblem, docxXmlToText, tidyBrief } from '@/lib/programme/briefs';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (text: string, num?: string) =>
  `<w:p>${num ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${num}"/></w:numPr></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;

/** The shape of the Build 2026 session brief: headings, a details table, a numbered list. */
const BRIEF = `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
  ${p('Session Brief: Academic Presentation')}
  <w:p><w:r><w:t>What Africa Stands to Lose: </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>The Unseen Costs</w:t></w:r></w:p>
  <w:tbl>
    <w:tr>${cell('DATE AND TIME')}${cell('Day Two, Thursday 22 October 2026, 10:20am – 10:40am')}</w:tr>
    <w:tr>${cell('VENUE')}${cell('Main Hall')}</w:tr>
  </w:tbl>
  ${p('What the Presentation Should Address')}
  ${p('The economic costs.', '4')}
  ${p('The scientific and human costs.', '4')}
  <w:p><w:r><w:t>Slides</w:t><w:tab/><w:t>are welcome.</w:t><w:br/><w:t>Thank you.</w:t></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>`;

describe('session briefs', () => {
  it('reads a Word brief: paragraphs, a table row per line, numbered points', () => {
    expect(docxXmlToText(BRIEF)).toBe(
      [
        'Session Brief: Academic Presentation',
        'What Africa Stands to Lose: The Unseen Costs',
        'DATE AND TIME\tDay Two, Thursday 22 October 2026, 10:20am – 10:40am',
        'VENUE\tMain Hall',
        '',
        'What the Presentation Should Address',
        '1. The economic costs.',
        '2. The scientific and human costs.',
        'Slides\tare welcome.',
        'Thank you.',
      ].join('\n'),
    );
  });

  it('reads nothing from a document with no body', () => {
    expect(docxXmlToText(`<w:document ${W}/>`)).toBe('');
  });

  it('tidies pasted text', () => {
    expect(tidyBrief('  Purpose\r\n\r\n\r\n\r\nIt   should address:  \n')).toBe('Purpose\n\nIt should address:');
  });

  it('says which files it cannot read', () => {
    expect(briefFileProblem({ name: 'brief.docx', size: 40_000 })).toBeNull();
    expect(briefFileProblem({ name: 'Brief.PDF', size: 40_000 })).toBeNull();
    expect(briefFileProblem({ name: 'brief.doc', size: 40_000 })).toMatch(/\.docx/);
    expect(briefFileProblem({ name: 'brief.png', size: 40_000 })).toMatch(/Word/);
    expect(briefFileProblem({ name: 'brief.pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});
