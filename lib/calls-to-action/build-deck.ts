import type PptxGenJS from 'pptxgenjs';

import { api } from '@/lib/api/client';
import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';
import { byline, contrast, tint, toDeckImage, type DeckImage, type DeckImageSource } from '@/lib/calls-to-action/deck';
import { nameFromTranscripts } from '@/lib/calls-to-action/who-said-it';

/**
 * The commitment template, from the Build conference's ("Commitment Tracking: Workflow &
 * Templates", by Fluxx Eco), drawn natively so the deck stays editable: its 13.33 × 7.5 in canvas,
 * the cards (Template #1, eight to a slide) or the table (Template #2), Montserrat. A session's
 * commitments, then its recommendations, each go on slides of their own; the end-of-day deck opens
 * on a cover and closes on a closing slide.
 *
 * It comes in two looks: Build's own (its blue, pastel cards and artwork from public/deck/build),
 * for an event set to the Build template, and any other event's (its brand colour, tints of it,
 * and its logo), so every event can have cards or a table.
 */

export type BuildLayout = 'cards' | 'table';

/** One session's slides: its title, "date | time | venue" line, and its approved commitments. */
export type BuildSession = { title: string; when: string; calls: CallToAction[] };

/** The template's artwork, loaded once: base64 PNG data (`image/png;base64,…`). */
export type BuildArt = { rings: string; africa: string; buildLogo: string; aiCollective: string };

/** How the slides look: Build's artwork and colours, or an event's own colour and logo. */
export type Look = {
  /** Titles, headers and numbers (six-digit hex, no #). */
  accent: string;
  cardTints: string[];
  rowTints: string[];
  /** Under each slide and on the cover, bottom right. */
  footer: string;
  eventName: string;
  /** Build's artwork, for the Build look; null draws the cover and closing in the accent. */
  art: BuildArt | null;
  logo: DeckImage | null;
};

export const BUILD_BLUE = '1533DF';
const GOLD = 'FDC110';
const INK = '000000';
const NUMBER_GREY = 'BDBDBD';
/** Lavender, pink, cream, mint: the template's card and row tints. */
const LAVENDER = 'D7DDFF';
const PINK = 'FFE2E5';
const CREAM = 'FFF8E4';
const MINT = 'E4FFEB';
/** Template #1 colours its eight cards in this order, the second row mirroring the first. */
export const CARD_TINTS = [LAVENDER, PINK, CREAM, MINT, MINT, CREAM, PINK, LAVENDER];
/** Template #2 colours its rows in this repeating order. */
export const ROW_TINTS = [LAVENDER, PINK, MINT, CREAM];
const SITE = 'www.buildconference.ai';

/** Build's look, from its template. */
export const buildLook = (art: BuildArt): Look => ({ accent: BUILD_BLUE, cardTints: CARD_TINTS, rowTints: ROW_TINTS, footer: SITE, eventName: 'Build', art, logo: null });

/** A colour mixed towards black (`amount` 0–1). */
const shade = (hex: string, amount: number) =>
  [0, 2, 4]
    .map((i) =>
      Math.round(parseInt(hex.replace('#', '').slice(i, i + 2), 16) * (1 - amount))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();

/**
 * An event's look: its brand colour (darkened until white reads on it, as the cover's ground and
 * the table's header), four tints of it for the cards and rows, and its logo.
 */
export function eventLook(event: { name: string; shortName: string; brandColor: string | null; logo: DeckImage | null }): Look {
  let accent = (event.brandColor ?? '#002D74').replace('#', '').toUpperCase();
  for (let step = 0; step < 10 && contrast('#FFFFFF', `#${accent}`) < 4.5; step++) accent = shade(accent, 0.15);
  const t = [0.82, 0.9, 0.86, 0.94].map((a) => tint(`#${accent}`, a).replace('#', '').toUpperCase());
  return {
    accent,
    cardTints: [t[0]!, t[1]!, t[2]!, t[3]!, t[3]!, t[2]!, t[1]!, t[0]!],
    rowTints: [t[0]!, t[1]!, t[3]!, t[2]!],
    footer: event.shortName,
    eventName: event.name,
    art: null,
    logo: event.logo,
  };
}
const FONT = 'Montserrat';

/** The template draws eight; six keeps a commitment's details readable at slide size. */
export const CARDS_PER_SLIDE = 6;
/** The table's body runs from just under its header to above the footer. */
const TABLE_TOP = 1.1;
const HEADER_H = 0.44;
const ROW_H = 0.44;
const TABLE_ROOM = 6.85 - TABLE_TOP - HEADER_H;
export const MAX_ROWS = 12;

/** "Commitment", the headline of a call. */
export const commitmentOf = (call: Pick<CallToAction, 'shortText' | 'action'>) => call.shortText.trim() || call.action.trim();
/** "Details": what is to be done, with the sum and the timeline when they were said, and who from there is at the event. */
export function detailsOf(call: Pick<CallToAction, 'action' | 'deadline' | 'amount' | 'present'>): string {
  const parts = [call.action.trim().replace(/\.?$/, '.')];
  if (call.amount?.trim()) parts.push(call.amount.trim().replace(/\.?$/, '.'));
  // deadlines are kept as said ("within 6 months", "the 2027 budget"), so they are labelled rather than worded
  if (call.deadline?.trim()) parts.push(`Timeline: ${call.deadline.trim().replace(/\.$/, '')}.`);
  if (call.present) parts.push(`Stakeholders here: ${call.present}.`);
  return parts.join(' ');
}
/** "Who said it?", or empty when nobody was named: the slide leaves it blank rather than say so. */
export const whoOf = (call: Pick<CallToAction, 'proposedBy' | 'proposedByOrganisation' | 'alsoProposedBy'>) => byline(call) ?? '';

/**
 * A table's rows split into slides: at most twelve rows, fewer when long details would push the
 * table past the footer (about 100 characters to a line in the Details column, 0.17 in a line).
 */
export function tablePages(calls: Pick<CallToAction, 'action' | 'deadline' | 'amount' | 'shortText' | 'present'>[]): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  calls.forEach((call, i) => {
    const lines = Math.max(Math.ceil(detailsOf(call).length / 100), Math.ceil(commitmentOf(call).length / 42), 1);
    const h = Math.max(ROW_H, 0.14 + lines * 0.17);
    if (page.length && (page.length === MAX_ROWS || used + h > TABLE_ROOM)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(i);
    used += h;
  });
  if (page.length) pages.push(page);
  return pages;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * Lines `text` wraps to in a box `w` inches wide at `pt`, for Montserrat (a wide face: about 0.58
 * of the size per character, 0.7 in bold capitals). PowerPoint only shrinks text to fit once a box
 * is edited, so sizes are chosen here instead of left to it.
 */
export function linesAt(text: string, w: number, pt: number, em = 0.58): number {
  const perLine = Math.max(1, Math.floor((w * 72) / (pt * em)));
  let lines = 0;
  for (const para of text.split('\n')) {
    let line = 0;
    lines++;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line + 1 + word.length > perLine) {
        lines++;
        line = word.length;
      } else line += (line ? 1 : 0) + word.length;
    }
  }
  return lines;
}

/** The largest size, from `sizes` (largest first), at which `text` fits `w` by `h` inches; with its height. */
export function fitText(text: string, w: number, h: number, sizes: number[], spacing = 1.2, em = 0.58, maxLines = Infinity): { pt: number; h: number } {
  for (const pt of sizes) {
    const lines = linesAt(text, w, pt, em);
    const height = (lines * pt * 1.2 * spacing) / 72;
    if (lines <= maxLines && height <= h) return { pt, h: height };
  }
  const pt = sizes.at(-1)!;
  return { pt, h: (linesAt(text, w, pt, em) * pt * 1.2 * spacing) / 72 };
}

/** The two kinds of call, in the order a session shows them: what was promised, then what was asked for. */
export const KINDS = [
  { type: 'pledge', plural: 'Commitments', one: 'Commitment' },
  { type: 'recommendation', plural: 'Recommendations', one: 'Recommendation' },
] as const;
export type Kind = (typeof KINDS)[number];

/** A session's approved calls by kind, leaving out a kind it has none of. */
export function sessionGroups(session: BuildSession): { kind: Kind; calls: CallToAction[] }[] {
  const approved = session.calls.filter((c) => c.status === 'approved');
  return KINDS.map((kind) => ({ kind, calls: approved.filter((c) => c.type === kind.type) })).filter((g) => g.calls.length > 0);
}

/** One kind's calls split into slides: eight cards, or as many table rows as fit. */
function pagesOf(calls: CallToAction[], layout: BuildLayout): number[][] {
  if (layout === 'table') return tablePages(calls);
  return Array.from({ length: Math.ceil(calls.length / CARDS_PER_SLIDE) }, (_, p) => calls.slice(p * CARDS_PER_SLIDE, (p + 1) * CARDS_PER_SLIDE).map((_, i) => p * CARDS_PER_SLIDE + i));
}

/** A slide's top and foot: the title, the kind and its date | time | venue line, the page count and the site. */
function frame(s: PptxGenJS.Slide, look: Look, title: string, kind: Kind, when: string, page: string) {
  s.background = { color: 'FFFFFF' };
  // one line at up to 24 pt; a long title wraps to two smaller lines in the same band, never into the line below
  const heading = title.toUpperCase();
  const oneLine = fitText(heading, 10.2, 0.62, [24, 22, 20], 1, 0.72, 1);
  const size = linesAt(heading, 10.2, oneLine.pt, 0.72) === 1 ? oneLine.pt : fitText(heading, 10.2, 0.62, [17, 16, 15, 14, 13, 12], 1, 0.72, 2).pt;
  s.addText(heading, { x: 0.22, y: 0.04, w: 10.34, h: 0.62, fontFace: FONT, fontSize: size, bold: true, color: look.accent, margin: 0, valign: 'middle', lineSpacingMultiple: 0.95, isTextBox: true });
  s.addText(
    [
      { text: kind.plural.toUpperCase(), options: { bold: true, color: look.accent } },
      { text: `  ·  ${when}`, options: { color: INK } },
    ],
    { x: 0.24, y: 0.72, w: 9.5, h: 0.24, fontFace: FONT, fontSize: 12, margin: 0, isTextBox: true },
  );
  if (look.art) {
    // Build's slides, as its template: the page count top right, the site in the foot, no logo
    s.addText(page, { x: 9.94, y: 0.72, w: 2.64, h: 0.24, fontFace: FONT, fontSize: 13, color: look.accent, align: 'right', margin: 0, isTextBox: true });
    s.addText(look.footer, { x: 10.5, y: 7.1, w: 2.6, h: 0.22, fontFace: FONT, fontSize: 13, color: look.accent, align: 'right', margin: 0, isTextBox: true });
    return;
  }
  // another event's: its logo top right, the page count beside its name in the foot
  if (look.logo) {
    const scale = Math.min(1.9 / look.logo.w, 0.8 / look.logo.h);
    const w = look.logo.w * scale;
    s.addImage({ data: look.logo.data, x: 13.05 - w, y: 0.12, w, h: look.logo.h * scale, altText: `${look.eventName} logo` });
  }
  s.addText(`${look.footer}  ·  ${page}`, { x: 9.5, y: 7.1, w: 3.6, h: 0.22, fontFace: FONT, fontSize: 13, color: look.accent, align: 'right', margin: 0, isTextBox: true });
}

/**
 * Where a slide's cards go: one row when there are four or fewer, using the slide's full height
 * (wider cards when there are fewer), else two rows of three. Centred across the slide.
 */
export function cardGrid(n: number): { x: number; y: number; w: number; h: number }[] {
  const [left, right, top, bottom, gap] = [0.55, 12.78, 1.25, 6.9, 0.25];
  const cols = n <= 4 ? Math.max(n, 1) : 3;
  const rows = n <= 4 ? 1 : 2;
  const w = Math.min((right - left - gap * (cols - 1)) / cols, 4.6);
  const h = rows === 1 ? Math.min(bottom - top, 4.2) : (bottom - top - gap) / 2;
  const start = left + (right - left - (w * cols + gap * (cols - 1))) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: start + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h }));
}

/** Template #1: up to six cards, sized to how many there are, their text sized to fit. */
function cardsSlide(pres: PptxGenJS, look: Look, session: BuildSession, kind: Kind, calls: CallToAction[], first: number, page: string) {
  const s = pres.addSlide();
  frame(s, look, session.title, kind, session.when, page);
  const grid = cardGrid(calls.length);
  const { w, h } = grid[0] ?? { w: 0, h: 0 };
  const pad = 0.2;
  const inner = w - pad * 2;
  const headW = inner; // the full width: the number sits in the bottom corner
  // one row of tall cards, or two rows where the headline has to leave room for the details
  const tall = h > 3;
  const whoW = inner - 0.55; // beside the number
  const lineH = (pt: number, lines: number) => (lines * pt * 1.2) / 72;
  // one size for every card on the slide, the one the fullest card needs, so the cards read as a set
  const headPt = Math.min(...calls.map((c) => fitText(commitmentOf(c), headW, tall ? Math.min(1.4, h * 0.38) : h * 0.26, tall ? [18, 17, 16, 15, 14, 13, 12, 11] : [14, 13, 12, 11, 10.5], 1, 0.62, tall ? 5 : 3).pt));
  const whoPt = h > 3 ? 11 : 10;
  const parts = calls.map((call) => {
    const head = commitmentOf(call);
    const headH = Math.max(lineH(headPt, linesAt(head, headW, headPt, 0.62)), 0.3);
    const who = whoOf(call);
    const whoH = Math.max(who ? lineH(whoPt, linesAt(who, whoW, whoPt)) : 0, 0.28);
    const room = h - pad * 2 - headH - 0.14 - whoH - 0.16;
    return { head, headH, who, whoH, room, details: detailsOf(call) };
  });
  // the body stays a step under the headline
  const bodySizes = [16, 15, 14, 13, 12, 11, 10.5, 10, 9.5, 9, 8.5, 8].filter((pt) => pt <= headPt - 1);
  const detailsPt = Math.min(...parts.map((p) => fitText(p.details, inner, p.room, bodySizes.length ? bodySizes : [8], 1.2, 0.56).pt));

  calls.forEach((_, i) => {
    const { x, y } = grid[i]!;
    const p = parts[i]!;
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.15, fill: { color: look.cardTints[i]! }, line: { type: 'none' } });
    s.addText(two(first + i + 1), { x: x + w - pad - 0.45, y: y + h - pad - 0.28, w: 0.45, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: NUMBER_GREY, align: 'right', margin: 0, isTextBox: true });
    // the headline beside the number; the details take the room left above the byline
    s.addText(p.head, { x: x + pad, y: y + pad, w: headW, h: p.headH + 0.04, fontFace: FONT, fontSize: headPt, bold: true, color: look.accent, valign: 'top', margin: 0, isTextBox: true });
    const detailsTop = y + pad + p.headH + 0.14;
    s.addText(p.details, { x: x + pad, y: detailsTop, w: inner, h: Math.max(p.room, 0.3), fontFace: FONT, fontSize: detailsPt, color: INK, valign: 'top', lineSpacingMultiple: 1.2, margin: 0, isTextBox: true });
    if (p.who) s.addText(p.who, { x: x + pad, y: y + h - pad - p.whoH, w: whoW, h: p.whoH + 0.02, fontFace: FONT, fontSize: whoPt, italic: true, color: look.accent, valign: 'bottom', margin: 0, isTextBox: true });
  });
}

/** Template #2: a native table of number, commitment (or recommendation), details and who said it. */
function tableSlide(pres: PptxGenJS, look: Look, session: BuildSession, kind: Kind, calls: CallToAction[], first: number, page: string) {
  const s = pres.addSlide();
  frame(s, look, session.title, kind, session.when, page);
  const border = { type: 'solid' as const, color: 'FFFFFF', pt: 1 };
  const cell = {
    fontFace: FONT,
    fontSize: 9,
    color: INK,
    valign: 'middle' as const,
    margin: [0.04, 0.08, 0.04, 0.08] as [number, number, number, number],
    border: [border, border, border, border] as [typeof border, typeof border, typeof border, typeof border],
  };
  const head = (text: string, align: 'left' | 'center' = 'left') => ({ text, options: { ...cell, bold: true, color: 'FFFFFF', fill: { color: look.accent }, align } });
  const rows: PptxGenJS.TableRow[] = [[head('No.', 'center'), head(kind.one), head('Details'), head('Who said it?')]];
  calls.forEach((call, i) => {
    const fill = { color: look.rowTints[(first + i) % look.rowTints.length]! };
    rows.push([
      { text: two(first + i + 1), options: { ...cell, fill, bold: true, color: look.accent, align: 'center' } },
      { text: commitmentOf(call), options: { ...cell, fill } },
      { text: detailsOf(call), options: { ...cell, fill } },
      { text: whoOf(call), options: { ...cell, fill } },
    ]);
  });
  s.addTable(rows, { x: 0.28, y: TABLE_TOP, w: 12.77, colW: [0.54, 2.77, 6.17, 3.29], rowH: [HEADER_H, ...calls.map(() => ROW_H)] });
}

/** A session's slides in the chosen layout, its commitments and then its recommendations; returns how many it added. */
function sessionSlides(pres: PptxGenJS, look: Look, session: BuildSession, layout: BuildLayout, number: (n: number) => string): number {
  let added = 0;
  for (const { kind, calls } of sessionGroups(session)) {
    pagesOf(calls, layout).forEach((indexes, p) => {
      const title = p === 0 ? session.title : `${session.title} (continued)`;
      const slice = indexes.map((i) => calls[i]!);
      if (layout === 'cards') cardsSlide(pres, look, { ...session, title }, kind, slice, indexes[0]!, number(added));
      else tableSlide(pres, look, { ...session, title }, kind, slice, indexes[0]!, number(added));
      added++;
    });
  }
  return added;
}

/** How many slides a session takes in a layout (for the page count before drawing). */
export function slideCount(session: BuildSession, layout: BuildLayout): number {
  return sessionGroups(session).reduce((n, g) => n + pagesOf(g.calls, layout).length, 0);
}

/** The blue cover: Build's logo, the rings and the Africa map, "Build Session / Commitment Tracking" and the day. */
function coverSlide(pres: PptxGenJS, art: BuildArt, subtitle: string) {
  const s = pres.addSlide();
  s.background = { color: BUILD_BLUE };
  s.addImage({ data: art.rings, x: 1.8, y: -0.75, w: 9.73, h: 9.73, altText: '' });
  s.addImage({ data: art.africa, x: 8.05, y: 1.67, w: 4.13, h: 4.15, altText: 'Map of Africa' });
  s.addImage({ data: art.buildLogo, x: 0.75, y: 0.62, w: 2.13, h: 0.37, altText: 'Build 2026' });
  s.addImage({ data: art.aiCollective, x: 11.73, y: 0.43, w: 0.9, h: 0.57, altText: 'AI Collective Nigeria' });
  s.addText('Build Session', { x: 0.75, y: 2.41, w: 7.2, h: 1.04, fontFace: FONT, fontSize: 57, bold: true, color: 'FFFFFF', margin: 0, isTextBox: true });
  s.addText('Commitment Tracking', { x: 0.75, y: 3.39, w: 7.4, h: 0.74, fontFace: FONT, fontSize: 40.5, bold: true, color: 'FFFFFF', margin: 0, isTextBox: true });
  s.addShape(pres.ShapeType.line, { x: 0.75, y: 4.26, w: 4.73, h: 0, line: { color: GOLD, width: 1 } });
  s.addText(subtitle, { x: 0.95, y: 4.48, w: 6.8, h: 0.34, fontFace: FONT, fontSize: 16, color: 'FFFFFF', margin: 0, fit: 'shrink', isTextBox: true });
  s.addText('PRESENTED BY:', { x: 0.75, y: 6.5, w: 2, h: 0.2, fontFace: FONT, fontSize: 12, color: 'FFFFFF', margin: 0, isTextBox: true });
  s.addText('Fluxx Eco', { x: 0.75, y: 6.72, w: 2.7, h: 0.26, fontFace: FONT, fontSize: 16, bold: true, color: 'F1F1F1', margin: 0, isTextBox: true });
  s.addText(SITE, { x: 10.2, y: 6.76, w: 2.4, h: 0.22, fontFace: FONT, fontSize: 12, color: 'FFFFFF', align: 'right', margin: 0, isTextBox: true });
}

/** The blue closing slide: the rings alone, as the template ends. */
function closingSlide(pres: PptxGenJS, art: BuildArt) {
  const s = pres.addSlide();
  s.background = { color: BUILD_BLUE };
  s.addImage({ data: art.rings, x: 1.8, y: -0.75, w: 9.73, h: 9.73, altText: '' });
}

/** Rings in white over the accent, standing in for Build's artwork on another event's cover and closing. */
function rings(pres: PptxGenJS, s: PptxGenJS.Slide, cx: number, cy: number) {
  [1.2, 2.1, 3, 3.9, 4.8].forEach((r, i) =>
    s.addShape(pres.ShapeType.ellipse, {
      x: cx - r,
      y: cy - r,
      w: r * 2,
      h: r * 2,
      fill: { type: 'none' },
      line: { color: 'FFFFFF', width: 1, transparency: 70 + i * 5, dashType: i % 2 ? 'dash' : 'solid' },
    }),
  );
}

/** The logo on a white tile (logos are drawn for light grounds), fitted into a box. */
function logoTile(s: PptxGenJS.Slide, logo: DeckImage, x: number, y: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / logo.w, maxH / logo.h);
  const w = logo.w * scale;
  const h = logo.h * scale;
  s.addShape('roundRect', { x: x - 0.15, y: y - 0.12, w: w + 0.3, h: h + 0.24, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { type: 'none' } });
  s.addImage({ data: logo.data, x, y, w, h, altText: 'Event logo' });
}

/** Another event's cover: its colour, white rings, its logo and name, and the day. */
function eventCoverSlide(pres: PptxGenJS, look: Look, subtitle: string) {
  const s = pres.addSlide();
  s.background = { color: look.accent };
  rings(pres, s, 10.6, 3.75);
  if (look.logo) logoTile(s, look.logo, 0.9, 0.7, 2.4, 0.9);
  s.addText(look.eventName, { x: 0.75, y: 2.2, w: 8.2, h: 1.3, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF', margin: 0, valign: 'bottom', fit: 'shrink', isTextBox: true });
  s.addText('Commitments and Recommendations', { x: 0.75, y: 3.55, w: 8.2, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: 'FFFFFF', margin: 0, fit: 'shrink', isTextBox: true });
  s.addShape(pres.ShapeType.line, { x: 0.75, y: 4.35, w: 4.73, h: 0, line: { color: 'FFFFFF', width: 1, transparency: 30 } });
  s.addText(subtitle, { x: 0.95, y: 4.57, w: 7.4, h: 0.34, fontFace: FONT, fontSize: 16, color: 'FFFFFF', margin: 0, fit: 'shrink', isTextBox: true });
  s.addText(look.footer, { x: 9.6, y: 6.76, w: 3, h: 0.22, fontFace: FONT, fontSize: 12, color: 'FFFFFF', align: 'right', margin: 0, isTextBox: true });
}

/** Another event's closing: its colour and the rings, with its logo. */
function eventClosingSlide(pres: PptxGenJS, look: Look) {
  const s = pres.addSlide();
  s.background = { color: look.accent };
  rings(pres, s, 6.67, 3.75);
  if (look.logo) logoTile(s, look.logo, 5.67, 3.3, 2, 0.9);
}

/**
 * Fills `pres` with the Build template: one session's slides, or the end-of-day deck (cover, each
 * session in turn, closing). Pages are numbered "n/total" across the deck, as the template does.
 */
export function addBuildSlides(pres: PptxGenJS, input: { sessions: BuildSession[]; layout: BuildLayout; look: Look; day?: { subtitle: string } }): void {
  pres.defineLayout({ name: 'BUILD', width: 13.333, height: 7.5 });
  pres.layout = 'BUILD';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const sessions = input.sessions.filter((s) => sessionGroups(s).length > 0);
  const body = sessions.reduce((n, s) => n + slideCount(s, input.layout), 0);
  const total = body + (input.day ? 2 : 0);
  let at = input.day ? 1 : 0;
  const { look } = input;
  if (input.day) {
    pres.title = look.art ? 'Build Session: Commitment Tracking' : `${look.eventName}: commitments and recommendations`;
    if (look.art) coverSlide(pres, look.art, input.day.subtitle);
    else eventCoverSlide(pres, look, input.day.subtitle);
  } else pres.title = `${sessions[0]?.title ?? 'Session'}: commitments`;
  for (const session of sessions) at += sessionSlides(pres, look, session, input.layout, (p) => `${at + p + 1}/${total}`);
  if (input.day) {
    if (look.art) closingSlide(pres, look.art);
    else eventClosingSlide(pres, look);
  }
}

/** The template's artwork from public/deck/build, as base64 PNG for the slides. */
export async function loadBuildArt(): Promise<BuildArt> {
  const load = async (name: string) => {
    const blob = await (await fetch(`/deck/build/${name}.png`)).blob();
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`The Build artwork (${name}) could not load.`));
      reader.readAsDataURL(blob);
    });
    return url.replace(/^data:/, '');
  };
  const [rings, africa, buildLogo, aiCollective] = await Promise.all(['rings', 'africa', 'build-2026', 'ai-collective'].map(load));
  return { rings: rings!, africa: africa!, buildLogo: buildLogo!, aiCollective: aiCollective! };
}

/**
 * The event's logo as a slide image, or null when it has none. The server sends it (storage does
 * not serve the console's origin); straight from storage only if the server cannot.
 */
async function loadLogo(editionId: string, url: string | null): Promise<DeckImage | null> {
  try {
    const { logo } = await api.get<{ logo: DeckImageSource | null }>(`/editions/${editionId}/calls-to-action/deck-images`);
    return await toDeckImage(logo);
  } catch {
    // an older server: try storage directly
  }
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
      reader.onerror = () => reject(new Error('logo'));
      reader.readAsDataURL(blob);
    });
    return await toDeckImage({ label: 'logo', mediaType: blob.type || 'image/png', data });
  } catch {
    return null; // the deck is drawn without it
  }
}

/**
 * Builds a template deck and hands it to the browser to save: in Build's look for an event set to
 * the Build template, else in the event's own colour and logo.
 */
export async function downloadBuildDeck(
  input: {
    sessions: BuildSession[];
    layout: BuildLayout;
    day?: { subtitle: string };
    event: { id: string; name: string; shortName: string; brandColor: string | null; logoUrl: string | null; build: boolean };
  },
  fileName: string,
): Promise<void> {
  const { default: Pptx } = await import('pptxgenjs');
  const pres = new Pptx();
  const { event, ...rest } = input;
  const look = event.build ? buildLook(await loadBuildArt()) : eventLook({ ...event, logo: await loadLogo(event.id, event.logoUrl) });
  // who said each call, from the named transcript, where the analysis left it blank
  const sessions = await Promise.all(rest.sessions.map(async (s) => ({ ...s, calls: await nameFromTranscripts(s.calls) })));
  addBuildSlides(pres, { ...rest, sessions, look });
  await pres.writeFile({ fileName });
}
