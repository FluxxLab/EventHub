/**
 * Fills the Rapporteur Session Guide (public/report/rapporteur-guide.docx, the Build Conference
 * template) with a session's report: the header lines, then one table per section, adding rows
 * where a section has more than the template's three. The briefing note on its first page is
 * guidance for the rapporteur, so the filled report starts at the guide itself. Everything else
 * (fonts, colours, borders, shading) stays as the template draws it.
 */

/** The report as the server writes it (see the backend's rapporteur-report.ts). */
export type RapporteurReport = {
  purpose: string;
  attendees: string;
  insights: { insight: string; whyItMatters: string; evidence: string; implications: string }[];
  perspectives: string[];
  opportunities: { opportunity: string; value: string; conditions: string }[];
  challenges: { challenge: string; disenablers: string; mitigation: string; stakeholder: string }[];
  recommendations: { recommendation: string; owner: string; nextStep: string; timeframe: string }[];
  commitments: { commitment: string; who: string; timeframe: string; followUpLead: string }[];
  synthesis: string;
};

export type ReportHeader = { event: string; date: string; title: string; completedBy: string; completedOn: string };

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NONE = 'None recorded in this session.';

const kids = (el: Element, name: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name);
const textOf = (el: Element) =>
  Array.from(el.getElementsByTagNameNS(W, 't'))
    .map((t) => t.textContent ?? '')
    .join('');

/** A copy without Word's paragraph ids, which must stay unique in the document. */
function cloneClean<T extends Element>(el: T): T {
  const copy = el.cloneNode(true) as T;
  for (const node of [copy, ...Array.from(copy.getElementsByTagName('*'))]) {
    node.removeAttributeNS(W14, 'paraId');
    node.removeAttributeNS(W14, 'textId');
  }
  return copy;
}

/** A run of text in the paragraph's own character style (its paragraph-mark properties). */
function run(doc: Document, p: Element, text: string): Element {
  const r = doc.createElementNS(W, 'w:r');
  const markProps = kids(p, 'pPr')[0] && kids(kids(p, 'pPr')[0]!, 'rPr')[0];
  if (markProps) r.appendChild(markProps.cloneNode(true));
  const t = doc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  return r;
}

/** Sets a table cell's text: one paragraph per line, in the cell's first paragraph's style. */
function setCell(doc: Document, tc: Element, text: string) {
  const paragraphs = kids(tc, 'p');
  const first = paragraphs[0]!;
  for (const extra of paragraphs.slice(1)) tc.removeChild(extra);
  for (const child of Array.from(first.childNodes)) if (child.nodeType === 1 && (child as Element).localName !== 'pPr') first.removeChild(child);
  const lines = text.split(/\n+/).filter((l) => l.trim());
  (lines.length ? lines : ['']).forEach((line, i) => {
    const p = i === 0 ? first : (cloneClean(first) as Element);
    if (i > 0) {
      for (const child of Array.from(p.childNodes)) if (child.nodeType === 1 && (child as Element).localName !== 'pPr') p.removeChild(child);
      tc.appendChild(p);
    }
    p.appendChild(run(doc, p, line));
  });
}

/**
 * Fills a section's table: its header row stays, its data rows carry one item each (the S/N
 * column numbered), alternating the template's plain and shaded rows; rows left over go. A
 * section with nothing to report keeps one row saying so.
 */
function fillTable(doc: Document, tbl: Element, items: string[][]) {
  const rows = kids(tbl, 'tr');
  const [head, ...templates] = rows;
  if (!head || !templates.length) return;
  // a table running onto the next page repeats its header there
  let trPr = kids(head, 'trPr')[0];
  if (!trPr) trPr = head.insertBefore(doc.createElementNS(W, 'w:trPr'), head.firstChild);
  if (!kids(trPr, 'tblHeader').length) trPr.appendChild(doc.createElementNS(W, 'w:tblHeader'));
  for (const row of templates) tbl.removeChild(row);
  const list = items.length ? items : [[NONE]];
  list.forEach((cells, i) => {
    const tr = cloneClean(templates[i % Math.min(2, templates.length)]!);
    const tcs = kids(tr, 'tc');
    const numbered = tcs.length > 1 && /^\d*$/.test(textOf(tcs[0]!).trim());
    if (numbered) setCell(doc, tcs[0]!, items.length ? String(i + 1) : '');
    const body = numbered ? tcs.slice(1) : tcs;
    body.forEach((tc, c) => setCell(doc, tc, cells[c] ?? ''));
    tbl.appendChild(tr);
  });
}

/** Replaces a "Label: ______" line's blank with the value, in the blank's (unbolded) style. */
function fillLine(p: Element, value: string) {
  const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
  const blanks = runs.filter((r) => /_{3,}/.test(textOf(r)));
  if (!blanks.length) return;
  const [first, ...rest] = blanks;
  for (const r of rest) r.parentNode?.removeChild(r);
  const t = first!.getElementsByTagNameNS(W, 't')[0]!;
  t.setAttribute('xml:space', 'preserve');
  t.textContent = value;
}

/** The filled document.xml, from the template's. */
export function fillReportXml(xml: string, header: ReportHeader, report: RapporteurReport): string {
  // Word writes a byte-order mark before the declaration, which browsers' XML parsers refuse
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The report template could not be read.');

  // start at the guide: the briefing note before it is for the rapporteur, not the report
  const blocks = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const start = blocks.findIndex((b) => b.localName === 'p' && textOf(b).trim().toUpperCase() === 'RAPPORTEUR SESSION GUIDE');
  if (start > 0) for (const b of blocks.slice(0, start)) body.removeChild(b);

  // the header lines; "Date:" comes twice, the session's then the day it was completed
  const dates = [header.date, header.completedOn];
  for (const p of Array.from(body.getElementsByTagNameNS(W, 'p'))) {
    const text = textOf(p).trim();
    if (/^Build Conference \d{4}$/.test(text)) {
      const ts = Array.from(p.getElementsByTagNameNS(W, 't'));
      ts.forEach((t, i) => (t.textContent = i === 0 ? header.event : ''));
    } else if (text.startsWith('Date:')) fillLine(p, dates.shift() ?? header.completedOn);
    else if (text.startsWith('Session Title:')) fillLine(p, header.title);
    else if (text.startsWith('Attendees:')) fillLine(p, report.attendees);
    else if (text.startsWith('Purpose:')) fillLine(p, report.purpose);
    else if (text.startsWith('Completed by:')) fillLine(p, header.completedBy);
  }

  // the section tables, in the template's order
  const tables = Array.from(body.getElementsByTagNameNS(W, 'tbl')).filter((t) => t.parentNode === body);
  const sections: string[][][] = [
    report.insights.map((r) => [r.insight, r.whyItMatters, r.evidence, r.implications]),
    report.perspectives.map((p) => [p]),
    report.opportunities.map((r) => [r.opportunity, r.value, r.conditions]),
    report.challenges.map((r) => [r.challenge, r.disenablers, r.mitigation, r.stakeholder]),
    report.recommendations.map((r) => [r.recommendation, r.owner, r.nextStep, r.timeframe]),
    report.commitments.map((r) => [r.commitment, r.who, r.timeframe, r.followUpLead]),
  ];
  sections.forEach((items, i) => tables[i] && fillTable(doc, tables[i]!, items));
  const closing = tables[6] && kids(tables[6], 'tr')[1];
  const closingCell = closing && kids(closing, 'tc')[0];
  if (closingCell) setCell(doc, closingCell, report.synthesis);

  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith('<?xml') ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}

/** The filled report as a Word file. */
export async function reportDocx(header: ReportHeader, report: RapporteurReport): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const template = await (await fetch('/report/rapporteur-guide.docx')).arrayBuffer();
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file('word/document.xml')!.async('string');
  zip.file('word/document.xml', fillReportXml(xml, header, report));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (text: string, opts: { bold?: boolean; size?: number; pageBreakBefore?: boolean } = {}) =>
  `<w:p xmlns:w="${W}"><w:pPr>${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}<w:spacing w:after="120"/></w:pPr><w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const pageBreak = () => `<w:p xmlns:w="${W}"><w:r><w:br w:type="page"/></w:r></w:p>`;

/**
 * One day's sessions in one document.xml: a contents page, then each session's filled guide on
 * its own pages. Each guide is filled from its own copy of the template; the copies' paragraph
 * ids and bookmarks are dropped so Word does not see the same id twice.
 */
export function fillDayReportXml(xml: string, cover: { event: string; day: string; sessions: string[] }, parts: { header: ReportHeader; report: RapporteurReport }[]): string {
  const filled = parts.map((p) => new DOMParser().parseFromString(fillReportXml(xml, p.header, p.report), 'application/xml'));
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The report template could not be read.');
  const sectPr = Array.from(body.childNodes).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'sectPr') ?? null;
  for (const n of Array.from(body.childNodes)) if (n !== sectPr) body.removeChild(n);

  const add = (fragment: string) => {
    const node = doc.importNode(new DOMParser().parseFromString(fragment, 'application/xml').documentElement, true);
    body.insertBefore(node, sectPr);
  };
  add(para(cover.event, { bold: true, size: 40 }));
  add(para(`End of day rapporteur report · ${cover.day}`, { bold: true, size: 30 }));
  add(para(`${cover.sessions.length} session${cover.sessions.length === 1 ? '' : 's'}, each on its own pages, drafted with AI from the session transcripts and approved calls to action. Check before sharing.`));
  cover.sessions.forEach((s, i) => add(para(`${i + 1}. ${s}`)));

  filled.forEach((f) => {
    add(pageBreak());
    const fBody = f.getElementsByTagNameNS(W, 'body')[0]!;
    for (const n of Array.from(fBody.childNodes)) {
      if (n.nodeType !== 1 || (n as Element).localName === 'sectPr') continue;
      const copy = doc.importNode(n, true) as Element;
      for (const el of [copy, ...Array.from(copy.getElementsByTagName('*'))]) {
        el.removeAttributeNS(W14, 'paraId');
        el.removeAttributeNS(W14, 'textId');
      }
      for (const b of [...Array.from(copy.getElementsByTagNameNS(W, 'bookmarkStart')), ...Array.from(copy.getElementsByTagNameNS(W, 'bookmarkEnd'))]) b.parentNode?.removeChild(b);
      body.insertBefore(copy, sectPr);
    }
  });
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith('<?xml') ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}

/** One day's reports as one Word file. */
export async function dayReportDocx(cover: { event: string; day: string; sessions: string[] }, parts: { header: ReportHeader; report: RapporteurReport }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const template = await (await fetch('/report/rapporteur-guide.docx')).arrayBuffer();
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file('word/document.xml')!.async('string');
  zip.file('word/document.xml', fillDayReportXml(xml, cover, parts));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Hands a file to the browser to save. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
