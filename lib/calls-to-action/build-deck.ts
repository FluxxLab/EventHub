import type PptxGenJS from 'pptxgenjs';

import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';
import { byline } from '@/lib/calls-to-action/deck';

/**
 * The Build conference's commitment template ("Commitment Tracking: Workflow & Templates", by Fluxx
 * Eco), drawn natively so the deck stays editable: its 13.33 × 7.5 in canvas, Build blue, the four
 * pastel cards, Montserrat, and its own artwork (public/deck/build). A session's commitments, then
 * its recommendations, each on slides of their own, go on cards (Template #1, eight to a slide) or
 * in a table (Template #2); the end-of-day deck opens on the blue cover and closes on the blue rings.
 */

export type BuildLayout = 'cards' | 'table';

/** One session's slides: its title, "date | time | venue" line, and its approved commitments. */
export type BuildSession = { title: string; when: string; calls: CallToAction[] };

/** The template's artwork, loaded once: base64 PNG data (`image/png;base64,…`). */
export type BuildArt = { rings: string; africa: string; buildLogo: string; aiCollective: string };

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
const FONT = 'Montserrat';

export const CARDS_PER_SLIDE = 8;
/** The table's body runs from just under its header to above the footer. */
const TABLE_TOP = 1.03;
const HEADER_H = 0.44;
const ROW_H = 0.44;
const TABLE_ROOM = 6.85 - TABLE_TOP - HEADER_H;
export const MAX_ROWS = 12;

/** "Commitment", the headline of a call. */
export const commitmentOf = (call: Pick<CallToAction, 'shortText' | 'action'>) => call.shortText.trim() || call.action.trim();
/** "Details": what is to be done, with the sum and the timeline when they were said. */
export function detailsOf(call: Pick<CallToAction, 'action' | 'deadline' | 'amount'>): string {
  const parts = [call.action.trim().replace(/\.?$/, '.')];
  if (call.amount?.trim()) parts.push(call.amount.trim().replace(/\.?$/, '.'));
  // deadlines are kept as said ("within 6 months", "the 2027 budget"), so they are labelled rather than worded
  if (call.deadline?.trim()) parts.push(`Timeline: ${call.deadline.trim().replace(/\.$/, '')}.`);
  return parts.join(' ');
}
/** "Who said it?" */
export const whoOf = (call: Pick<CallToAction, 'proposedBy' | 'proposedByOrganisation' | 'alsoProposedBy'>) => byline(call) ?? 'Not recorded';

/**
 * A table's rows split into slides: at most twelve rows, fewer when long details would push the
 * table past the footer (about 100 characters to a line in the Details column, 0.17 in a line).
 */
export function tablePages(calls: Pick<CallToAction, 'action' | 'deadline' | 'amount' | 'shortText'>[]): number[][] {
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
function frame(s: PptxGenJS.Slide, title: string, kind: Kind, when: string, page: string) {
  s.background = { color: 'FFFFFF' };
  s.addText(title.toUpperCase(), { x: 0.22, y: 0.03, w: 10.34, h: 0.53, fontFace: FONT, fontSize: 24, bold: true, color: BUILD_BLUE, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
  s.addText(
    [
      { text: kind.plural.toUpperCase(), options: { bold: true, color: BUILD_BLUE } },
      { text: `  ·  ${when}`, options: { color: INK } },
    ],
    { x: 0.24, y: 0.57, w: 9.5, h: 0.22, fontFace: FONT, fontSize: 12, margin: 0, isTextBox: true },
  );
  s.addText(page, { x: 9.94, y: 0.57, w: 2.64, h: 0.22, fontFace: FONT, fontSize: 13, color: BUILD_BLUE, align: 'right', margin: 0, isTextBox: true });
  s.addText(SITE, { x: 10.5, y: 7.1, w: 2.6, h: 0.22, fontFace: FONT, fontSize: 13, color: BUILD_BLUE, align: 'right', margin: 0, isTextBox: true });
}

/** Template #1: up to eight cards, two rows of four. */
function cardsSlide(pres: PptxGenJS, session: BuildSession, kind: Kind, calls: CallToAction[], first: number, page: string) {
  const s = pres.addSlide();
  frame(s, session.title, kind, session.when, page);
  const xs = [0.61, 3.67, 6.69, 9.75];
  const ys = [1.4, 4.03];
  calls.forEach((call, i) => {
    const x = xs[i % 4]!;
    const y = ys[Math.floor(i / 4)]!;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.85, h: 2.44, rectRadius: 0.15, fill: { color: CARD_TINTS[i]! }, line: { type: 'none' } });
    s.addText(commitmentOf(call), { x: x + 0.15, y: y + 0.12, w: 2.2, h: 0.5, fontFace: FONT, fontSize: 13, color: BUILD_BLUE, valign: 'top', margin: 0, fit: 'shrink', isTextBox: true });
    s.addText(two(first + i + 1), { x: x + 2.33, y: y + 0.1, w: 0.4, h: 0.26, fontFace: FONT, fontSize: 13, bold: true, color: NUMBER_GREY, align: 'right', margin: 0, isTextBox: true });
    s.addText(detailsOf(call), {
      x: x + 0.15,
      y: y + 0.7,
      w: 2.56,
      h: 1.3,
      fontFace: FONT,
      fontSize: 10,
      color: INK,
      valign: 'top',
      lineSpacingMultiple: 1.2,
      margin: 0,
      fit: 'shrink',
      isTextBox: true,
    });
    s.addText(whoOf(call), { x: x + 0.15, y: y + 2.04, w: 2.56, h: 0.26, fontFace: FONT, fontSize: 10, italic: true, color: BUILD_BLUE, margin: 0, fit: 'shrink', isTextBox: true });
  });
}

/** Template #2: a native table of number, commitment (or recommendation), details and who said it. */
function tableSlide(pres: PptxGenJS, session: BuildSession, kind: Kind, calls: CallToAction[], first: number, page: string) {
  const s = pres.addSlide();
  frame(s, session.title, kind, session.when, page);
  const border = { type: 'solid' as const, color: 'FFFFFF', pt: 1 };
  const cell = {
    fontFace: FONT,
    fontSize: 9,
    color: INK,
    valign: 'middle' as const,
    margin: [0.04, 0.08, 0.04, 0.08] as [number, number, number, number],
    border: [border, border, border, border] as [typeof border, typeof border, typeof border, typeof border],
  };
  const head = (text: string, align: 'left' | 'center' = 'left') => ({ text, options: { ...cell, bold: true, color: 'FFFFFF', fill: { color: BUILD_BLUE }, align } });
  const rows: PptxGenJS.TableRow[] = [[head('No.', 'center'), head(kind.one), head('Details'), head('Who said it?')]];
  calls.forEach((call, i) => {
    const fill = { color: ROW_TINTS[(first + i) % ROW_TINTS.length]! };
    rows.push([
      { text: two(first + i + 1), options: { ...cell, fill, bold: true, color: BUILD_BLUE, align: 'center' } },
      { text: commitmentOf(call), options: { ...cell, fill } },
      { text: detailsOf(call), options: { ...cell, fill } },
      { text: whoOf(call), options: { ...cell, fill } },
    ]);
  });
  s.addTable(rows, { x: 0.28, y: TABLE_TOP, w: 12.77, colW: [0.54, 2.77, 6.17, 3.29], rowH: [HEADER_H, ...calls.map(() => ROW_H)] });
}

/** A session's slides in the chosen layout, its commitments and then its recommendations; returns how many it added. */
function sessionSlides(pres: PptxGenJS, session: BuildSession, layout: BuildLayout, number: (n: number) => string): number {
  let added = 0;
  for (const { kind, calls } of sessionGroups(session)) {
    pagesOf(calls, layout).forEach((indexes, p) => {
      const title = p === 0 ? session.title : `${session.title} (continued)`;
      const slice = indexes.map((i) => calls[i]!);
      if (layout === 'cards') cardsSlide(pres, { ...session, title }, kind, slice, indexes[0]!, number(added));
      else tableSlide(pres, { ...session, title }, kind, slice, indexes[0]!, number(added));
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

/**
 * Fills `pres` with the Build template: one session's slides, or the end-of-day deck (cover, each
 * session in turn, closing). Pages are numbered "n/total" across the deck, as the template does.
 */
export function addBuildSlides(pres: PptxGenJS, input: { sessions: BuildSession[]; layout: BuildLayout; art: BuildArt; day?: { subtitle: string } }): void {
  pres.defineLayout({ name: 'BUILD', width: 13.333, height: 7.5 });
  pres.layout = 'BUILD';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const sessions = input.sessions.filter((s) => sessionGroups(s).length > 0);
  const body = sessions.reduce((n, s) => n + slideCount(s, input.layout), 0);
  const total = body + (input.day ? 2 : 0);
  let at = input.day ? 1 : 0;
  if (input.day) {
    pres.title = 'Build Session: Commitment Tracking';
    coverSlide(pres, input.art, input.day.subtitle);
  } else pres.title = `${sessions[0]?.title ?? 'Session'}: commitments`;
  for (const session of sessions) at += sessionSlides(pres, session, input.layout, (p) => `${at + p + 1}/${total}`);
  if (input.day) closingSlide(pres, input.art);
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

/** Builds a Build-template deck and hands it to the browser to save. */
export async function downloadBuildDeck(input: { sessions: BuildSession[]; layout: BuildLayout; day?: { subtitle: string } }, fileName: string): Promise<void> {
  const { default: Pptx } = await import('pptxgenjs');
  const pres = new Pptx();
  addBuildSlides(pres, { ...input, art: await loadBuildArt() });
  await pres.writeFile({ fileName });
}
