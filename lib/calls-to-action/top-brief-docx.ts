/**
 * The event's abridged brief as a Word file: the top recommendations and commitments from across
 * all its sessions, each with who it is for, who raised it, their words and why it ranks.
 *
 * Laid out as a policy brief: a cover block with the PIC logo, an executive summary, the picks at
 * a glance, then each pick in full, and how the brief was made at the end. Times New Roman,
 * justified, 1.5 line spacing, page numbers in the footer. Built on the Rapporteur Session Guide
 * (public/report/rapporteur-guide.docx) for its page setup; the guide's own content is replaced.
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
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const LOGO_REL = 'rIdBriefLogo';
const FOOTER_REL = 'rIdBriefFooter';

const FONT = 'Times New Roman';
const NAVY = '1F3864';
const GREY = '595959';
/** 1.5 line spacing, in 240ths of a line. */
const LINE = 360;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** No em or en dashes: a range keeps a hyphen, any other dash becomes a comma. */
export const undash = (s: string) =>
  s
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/^\s*[–—]\s*/, '')
    .replace(/\s*[–—]\s*$/, '')
    .replace(/,?\s*[–—]\s*/g, ', ');

/** A session title's dash is a colon: "Research Presentation: Tech Justice". */
const sessionTitle = (s: string) => undash(s.replace(/\s+[–—]\s+/g, ': '));

type Run = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };

const run = (r: Run) =>
  `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}<w:sz w:val="${r.size ?? 24}"/><w:szCs w:val="${r.size ?? 24}"/></w:rPr><w:t xml:space="preserve">${esc(undash(r.text))}</w:t></w:r>`;

type ParaOpts = {
  after?: number;
  before?: number;
  indent?: number;
  hanging?: number;
  keepNext?: boolean;
  align?: 'both' | 'left' | 'center';
  /** A rule under the paragraph, in this colour. */
  rule?: string;
  pageBreakBefore?: boolean;
  /** Single spacing, for the cover's title lines. */
  tight?: boolean;
};

const pPr = (o: ParaOpts) =>
  `<w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}<w:keepLines/>${o.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${o.rule ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${o.rule}"/></w:pBdr>` : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}" w:line="${o.tight ? 240 : LINE}" w:lineRule="auto"/>${o.indent ? `<w:ind w:left="${o.indent}"${o.hanging ? ` w:hanging="${o.hanging}"` : ''}/>` : ''}<w:jc w:val="${o.align ?? 'both'}"/></w:pPr>`;

const para = (runs: Run[], o: ParaOpts = {}) => `<w:p xmlns:w="${W}">${pPr(o)}${runs.map(run).join('')}</w:p>`;

/** A section heading: navy, with a rule beneath. */
const heading = (text: string, o: ParaOpts = {}) => para([{ text, bold: true, size: 30, color: NAVY }], { before: 360, after: 160, keepNext: true, align: 'left', rule: NAVY, ...o });

const subheading = (text: string) => para([{ text, bold: true, size: 26, color: NAVY }], { before: 200, after: 80, keepNext: true, align: 'left' });

/** "Label: value" under a pick, indented. */
const field = (label: string, value: string, italic = false) => para([{ text: `${label}: `, bold: true, size: 22 }, { text: value, italic, size: 22 }], { indent: 360, after: 60 });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A target the captions left open ("Not specified in transcript"): not worth a line. */
const named = (s: string) => !!s.trim() && !/^(not specified.*|unspecified|unknown|none|n\/a|-|—|–)$/i.test(s.trim());

/** The logo as an inline picture, `cx` by `cy` in EMUs. */
const logoXml = (cx: number, cy: number) =>
  `<w:p xmlns:w="${W}">${pPr({ align: 'center', after: 240, tight: true })}<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1001" name="PIC logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1001" name="pic-logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="${LOGO_REL}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

/** One pick's paragraphs: its headline, then what it involves and who said it. */
function itemXml(item: BriefItem, kind: 'recommendation' | 'commitment'): string[] {
  const parts = [
    para([{ text: `${item.rank}. ${item.title}`, bold: true, size: 24 }, ...(item.pending ? [{ text: '  (pending review)', italic: true, size: 22, color: 'B45309' }] : [])], {
      before: 240,
      after: 80,
      keepNext: true,
      indent: 360,
      hanging: 360,
    }),
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
  if (item.session) parts.push(field('Session', sessionTitle(item.session)));
  if (item.whyItRanks) parts.push(field('Why it ranks', item.whyItRanks));
  return parts;
}

/** The numbered headlines, for the "at a glance" page. */
const glance = (items: BriefItem[]) => items.map((i) => para([{ text: `${i.rank}.  `, bold: true }, { text: i.title }], { indent: 360, hanging: 360, after: 60 }));

/** The brief's paragraphs, in order. Pass the logo's size in EMUs to put it on the cover. */
export function topBriefParagraphs(brief: TopBrief, preparedOn: string, logo?: { cx: number; cy: number }): string[] {
  const n = Math.max(brief.recommendations.length, brief.commitments.length);
  const out: string[] = [];
  if (logo) out.push(logoXml(logo.cx, logo.cy));
  out.push(
    para([{ text: brief.event, bold: true, size: 40, color: NAVY }], { align: 'center', after: 120, tight: true }),
    para([{ text: `Top ${n} Recommendations and Commitments`, bold: true, size: 30 }], { align: 'center', after: 120, tight: true }),
    para([{ text: preparedOn, italic: true, size: 22, color: GREY }], { align: 'center', after: 240, tight: true, rule: NAVY }),
  );

  if (brief.summary) out.push(heading('Executive Summary'), para([{ text: brief.summary }], { after: 160 }));

  if (brief.recommendations.length || brief.commitments.length) {
    out.push(heading('At a Glance'));
    if (brief.recommendations.length) out.push(subheading('Recommendations'), ...glance(brief.recommendations));
    if (brief.commitments.length) out.push(subheading('Commitments'), ...glance(brief.commitments));
  }

  out.push(heading('Top Recommendations', { before: 480 }));
  if (brief.recommendations.length) out.push(...brief.recommendations.flatMap((r) => itemXml(r, 'recommendation')));
  else out.push(para([{ text: 'No recommendations were found.', italic: true }]));

  out.push(heading('Top Commitments', { before: 480 }));
  if (brief.commitments.length) out.push(...brief.commitments.flatMap((c) => itemXml(c, 'commitment')));
  else out.push(para([{ text: 'No commitments were found.', italic: true }]));

  if (brief.honourableMentions.length) {
    out.push(heading('Also Worth Noting', { before: 480 }));
    out.push(...brief.honourableMentions.map((m) => para([{ text: '•  ' }, { text: m }], { indent: 360, hanging: 240, after: 60 })));
  }

  out.push(
    heading('About This Brief', { before: 480 }),
    para(
      [
        {
          text: `Prepared ${preparedOn} from ${plural(brief.read.approved, 'approved call')} to action${brief.read.pending ? ` and ${brief.read.pending} still pending review` : ''}, across all sessions. Ranked with AI by importance, how widely each was raised and how actionable it is, with no more than one pick per speaker and two per session in each list. Speakers and quotes are as captioned. A draft: check before sharing.`,
          italic: true,
          size: 22,
          color: GREY,
        },
      ],
      { after: 120 },
    ),
  );
  return out;
}

/** The footer: the event and the page number, centred. */
export function footerXml(event: string): string {
  const r = (text: string) => run({ text, size: 18, color: GREY });
  // a full field, so the page number keeps the footer's font
  const rPr = `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:color w:val="${GREY}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`;
  const fld = (instr: string) =>
    `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr}<w:t>1</w:t></w:r><w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${r(`${event}  |  Page `)}${fld('PAGE')}${r(' of ')}${fld('NUMPAGES')}</w:p></w:ftr>`;
}

/**
 * The template's document.xml with its body replaced by the brief, keeping the page setup. With
 * `footer`, the section points at the brief's footer part.
 */
export function fillTopBriefXml(xml: string, brief: TopBrief, preparedOn: string, opts: { logo?: { cx: number; cy: number }; footer?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ''), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The report template could not be read.');
  const sectPr = Array.from(body.childNodes).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'sectPr') ?? null;
  for (const n of Array.from(body.childNodes)) if (n !== sectPr) body.removeChild(n);
  for (const fragment of topBriefParagraphs(brief, preparedOn, opts.logo)) {
    body.insertBefore(doc.importNode(new DOMParser().parseFromString(fragment, 'application/xml').documentElement, true), sectPr);
  }
  if (opts.footer && sectPr) {
    for (const old of Array.from(sectPr.getElementsByTagNameNS(W, 'footerReference'))) sectPr.removeChild(old);
    const ref = doc.createElementNS(W, 'w:footerReference');
    ref.setAttributeNS(W, 'w:type', 'default');
    ref.setAttributeNS(R, 'r:id', FOOTER_REL);
    sectPr.insertBefore(ref, sectPr.firstChild);
  }
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith('<?xml') ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}

/** A PNG's size in pixels, from its header. */
const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
};

/** The brief as a Word file. */
export async function topBriefDocx(brief: TopBrief, preparedOn: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const [template, logoBytes] = await Promise.all([
    fetch('/report/rapporteur-guide.docx').then((r) => r.arrayBuffer()),
    fetch('/pic-logo.png')
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
  ]);
  const zip = await JSZip.loadAsync(template);

  let logo: { cx: number; cy: number } | undefined;
  if (logoBytes) {
    const bytes = new Uint8Array(logoBytes);
    const { w, h } = pngSize(bytes);
    const cy = 914400; // one inch tall
    logo = { cx: Math.round((cy * w) / h), cy };
    zip.file('word/media/pic-logo.png', bytes);
  }
  zip.file('word/footer-brief.xml', footerXml(brief.event));

  const relsPath = 'word/_rels/document.xml.rels';
  let rels = await zip.file(relsPath)!.async('string');
  const rel = (id: string, type: string, target: string) => (rels.includes(`Id="${id}"`) ? '' : `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`);
  rels = rels.replace('</Relationships>', `${logo ? rel(LOGO_REL, 'image', 'media/pic-logo.png') : ''}${rel(FOOTER_REL, 'footer', 'footer-brief.xml')}</Relationships>`);
  zip.file(relsPath, rels);

  let types = await zip.file('[Content_Types].xml')!.async('string');
  if (!/Extension="png"/i.test(types)) types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  if (!types.includes('/word/footer-brief.xml'))
    types = types.replace('</Types>', '<Override PartName="/word/footer-brief.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  zip.file('[Content_Types].xml', types);

  const xml = await zip.file('word/document.xml')!.async('string');
  zip.file('word/document.xml', fillTopBriefXml(xml, brief, preparedOn, { logo, footer: true }));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
