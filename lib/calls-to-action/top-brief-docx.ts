/**
 * The event's abridged brief as a Word file: the top recommendations and commitments from across
 * all its sessions, each with who it is for, who raised it, their words and why it ranks. Built on the
 * Rapporteur Session Guide (public/report/rapporteur-guide.docx) so it keeps the event's page
 * setup and fonts; the guide's own content is replaced.
 */

/** One pick, as the server returns it (see the backend's top-brief.ts). */
export type BriefItem = {
  rank: number;
  title: string;
  detail: string;
  whyItRanks: string;
  directedAt: string;
  raisedBy: string[];
  quote: string | null;
  deadline: string | null;
  amount: string | null;
  session: string | null;
  pending: boolean;
};

export type TopBrief = {
  event: string;
  read: { approved: number; pending: number };
  summary: string;
  recommendations: BriefItem[];
  commitments: BriefItem[];
  honourableMentions: string[];
};

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Run = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };

const run = (r: Run) =>
  `<w:r><w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}${r.size ? `<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;

const para = (runs: Run[], opts: { after?: number; before?: number; indent?: number; keepNext?: boolean } = {}) =>
  `<w:p xmlns:w="${W}"><w:pPr>${opts.keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 120}"/>${opts.indent ? `<w:ind w:left="${opts.indent}"/>` : ''}</w:pPr>${runs.map(run).join('')}</w:p>`;

/** "Label: value" under an item, indented. */
const field = (label: string, value: string, italic = false) => para([{ text: `${label}: `, bold: true }, { text: value, italic }], { indent: 360, after: 60 });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A target the captions left open ("Not specified", "—"): not worth a line. */
const named = (s: string) => !!s.trim() && !/^(not specified|unspecified|unknown|none|n\/a|-|—)$/i.test(s.trim());

/** One pick's paragraphs: its headline, then what it involves and who said it. */
function itemXml(item: BriefItem, kind: 'recommendation' | 'commitment'): string[] {
  const parts = [
    para([{ text: `${item.rank}. ${item.title}`, bold: true, size: 24 }, ...(item.pending ? [{ text: '  (pending review)', italic: true, color: 'B45309' }] : [])], { before: 200, after: 80, keepNext: true }),
  ];
  if (item.detail) parts.push(para([{ text: item.detail }], { indent: 360, after: 80 }));
  if (kind === 'recommendation') {
    if (named(item.directedAt)) parts.push(field('Directed at', item.directedAt));
    if (item.raisedBy.length) parts.push(field('Raised by', item.raisedBy.join('; ')));
  } else {
    if (named(item.directedAt)) parts.push(field('Who will act', item.directedAt));
    if (item.raisedBy.length) parts.push(field('Said by', item.raisedBy.join('; ')));
  }
  if (item.deadline) parts.push(field('Timeline', item.deadline));
  if (item.amount) parts.push(field('Amount', item.amount));
  if (item.quote) parts.push(field('In their words', `“${item.quote.replace(/^["“]|["”]$/g, '')}”`, true));
  if (item.session) parts.push(field('Session', item.session));
  if (item.whyItRanks) parts.push(field('Why it ranks', item.whyItRanks));
  return parts;
}

/** The brief's paragraphs, in order. */
export function topBriefParagraphs(brief: TopBrief, preparedOn: string): string[] {
  const n = Math.max(brief.recommendations.length, brief.commitments.length);
  const out = [
    para([{ text: brief.event, bold: true, size: 40 }], { after: 60 }),
    para([{ text: `Top ${n} recommendations and commitments`, bold: true, size: 30 }], { after: 120 }),
    para(
      [
        {
          text: `Prepared ${preparedOn} from ${plural(brief.read.approved, 'approved call')} to action${brief.read.pending ? ` and ${brief.read.pending} still pending review` : ''}, across all sessions. Ranked with AI by importance, how widely each was raised and how actionable it is, with no more than one pick per speaker and two per session in each list. Speakers and quotes are as captioned. A draft: check before sharing.`,
          italic: true,
          size: 18,
          color: '555555',
        },
      ],
      { after: 240 },
    ),
  ];
  if (brief.summary) out.push(para([{ text: brief.summary }], { after: 240 }));

  out.push(para([{ text: 'Top recommendations', bold: true, size: 28 }], { before: 240, after: 60, keepNext: true }));
  if (brief.recommendations.length) out.push(...brief.recommendations.flatMap((r) => itemXml(r, 'recommendation')));
  else out.push(para([{ text: 'No recommendations were found.', italic: true }]));

  out.push(para([{ text: 'Top commitments', bold: true, size: 28 }], { before: 360, after: 60, keepNext: true }));
  if (brief.commitments.length) out.push(...brief.commitments.flatMap((c) => itemXml(c, 'commitment')));
  else out.push(para([{ text: 'No commitments were found.', italic: true }]));

  if (brief.honourableMentions.length) {
    out.push(para([{ text: 'Also worth noting', bold: true, size: 24 }], { before: 360, after: 60, keepNext: true }));
    out.push(...brief.honourableMentions.map((m) => para([{ text: `•  ${m}` }], { indent: 360, after: 60 })));
  }
  return out;
}

/** The template's document.xml with its body replaced by the brief, keeping the page setup. */
export function fillTopBriefXml(xml: string, brief: TopBrief, preparedOn: string): string {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ''), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The report template could not be read.');
  const sectPr = Array.from(body.childNodes).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'sectPr') ?? null;
  for (const n of Array.from(body.childNodes)) if (n !== sectPr) body.removeChild(n);
  for (const fragment of topBriefParagraphs(brief, preparedOn)) {
    body.insertBefore(doc.importNode(new DOMParser().parseFromString(fragment, 'application/xml').documentElement, true), sectPr);
  }
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith('<?xml') ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}

/** The brief as a Word file. */
export async function topBriefDocx(brief: TopBrief, preparedOn: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const template = await (await fetch('/report/rapporteur-guide.docx')).arrayBuffer();
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file('word/document.xml')!.async('string');
  zip.file('word/document.xml', fillTopBriefXml(xml, brief, preparedOn));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
