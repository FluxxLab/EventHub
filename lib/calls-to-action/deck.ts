import type PptxGenJS from 'pptxgenjs';

import type { CallToAction } from './calls-to-action';

/**
 * The calls-to-action deck: an event's approved calls as a PowerPoint, designed afresh for each
 * event. Claude designs it on the server from the event's brand colour, logo, cover and calls
 * (`POST /editions/:id/calls-to-action/deck-design`): palette, fonts, a layout for each kind of
 * slide, its decorative shapes, and the sections. This file draws the slides from that design, and
 * draws a plainer one in the event's colours when Claude cannot answer. Each call reads as the
 * organisers approved it; its full wording and quote go in the speaker notes.
 */

/* -------------------------------------------------------------- the design */

export type ShapeKind = 'ellipse' | 'rect' | 'roundRect' | 'triangle' | 'rtTriangle' | 'diamond' | 'rings';
export type ColourRole = 'primary' | 'secondary' | 'accent' | 'surface' | 'muted';
export type DeckShape = { kind: ShapeKind; x: number; y: number; w: number; h: number; colour: ColourRole; rotate: number; flipH: boolean; flipV: boolean; transparency: number };

export type DeckDesign = {
  rationale: string;
  palette: { primary: string; secondary: string; accent: string; background: string; surface: string; text: string; muted: string };
  headingFont: string;
  bodyFont: string;
  uppercaseTitles: boolean;
  deckTitle: string;
  deckSubtitle: string;
  layouts: { cover: 'arch' | 'split' | 'band' | 'frame' | 'photo'; summary: 'stats' | 'statement'; section: 'cards' | 'list' | 'spotlight'; closing: 'circle' | 'split' | 'band' };
  /** The slides' artwork as SVG (a 1600 × 900 canvas), drawn by Claude; null where the shapes stand in. */
  art?: { cover: string | null; content: string | null; closing: string | null };
  decor: { cover: DeckShape[]; content: DeckShape[]; closing: DeckShape[] };
  summary: { headline: string; points: string[] };
  sections: { title: string; intro: string | null; callIds: string[] }[];
  nextSteps: { lead: string; rest: string }[];
};

/** An image as the server sends it: the event's logo or cover, base64. */
export type DeckImageSource = { label: 'logo' | 'cover'; mediaType: string; data: string };
export type DeckDesignResponse = { design: DeckDesign | null; reason: string | null; brandColor: string | null; logo: DeckImageSource | null; cover: DeckImageSource | null };

/** An image ready for the slide: PNG data (`image/png;base64,…`) and its size in pixels. */
export type DeckImage = { data: string; w: number; h: number };

export type DeckInput = {
  event: { name: string; shortName: string; when: string; where: string | null };
  design: DeckDesign;
  /** The approved calls; the deck leaves out anything else it is given. */
  calls: CallToAction[];
  sessionTitle: (sessionId: string | null) => string;
  logo: DeckImage | null;
  cover: DeckImage | null;
};

/* ---------------------------------------------------------------- helpers */

export const PIC_NAVY = '#002D74';
const W = 10;
const H = 5.625;

export const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
/** Splits a list into as few pages as `max` allows, as evenly as it can: 4 at 3 a page is 2 + 2. */
export const spread = <T>(list: T[], max: number): T[][] => chunk(list, Math.ceil(list.length / Math.max(1, Math.ceil(list.length / max))));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1F2D8F" from "#1f2d8f": pptxgenjs wants six digits, no hash. */
const c = (hex: string) => hex.replace('#', '').toUpperCase();

function luminance(hex: string): number {
  const v = c(hex);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const ch = parseInt(v.slice(i, i + 2), 16) / 255;
    return ch <= 0.03928 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** The preferred colour if it reads on `bg`, else white or near-black, whichever reads better. */
export function readable(bg: string, preferred: string, min = 4.5): string {
  if (contrast(preferred, bg) >= min) return preferred;
  return contrast('#FFFFFF', bg) >= contrast('#1A1A1A', bg) ? '#FFFFFF' : '#1A1A1A';
}

/** A colour mixed towards white (`amount` 0–1). */
export function tint(hex: string, amount: number): string {
  const v = c(hex);
  return `#${[0, 2, 4]
    .map((i) => {
      const ch = parseInt(v.slice(i, i + 2), 16);
      return Math.round(ch + (255 - ch) * amount)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** Who proposed a call, as its byline: "Dr Amina Bello, NBS", or null when nobody was named. */
export function byline(call: Pick<CallToAction, 'proposedBy' | 'proposedByOrganisation' | 'alsoProposedBy'>): string | null {
  const who = [call.proposedBy, call.proposedByOrganisation].filter(Boolean).join(', ');
  const others = call.alsoProposedBy.length ? ` and ${plural(call.alsoProposedBy.length, 'other')}` : '';
  return who ? `${who}${others}` : null;
}

export type CallGroup = { directedAt: string; calls: CallToAction[] };

/** The approved calls by who they call on: most-called first, then by name; each group in the order said. */
export function groupCalls(calls: CallToAction[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  for (const call of calls.filter((x) => x.status === 'approved')) {
    const key = call.directedAt.trim().toLowerCase();
    const group = groups.get(key) ?? { directedAt: call.directedAt.trim(), calls: [] };
    group.calls.push(call);
    groups.set(key, group);
  }
  const said = (x: CallToAction) => x.saidAt ?? x.createdAt;
  return [...groups.values()]
    .map((g) => ({ ...g, calls: [...g.calls].sort((a, b) => said(a).localeCompare(said(b))) }))
    .sort((a, b) => b.calls.length - a.calls.length || a.directedAt.localeCompare(b.directedAt));
}

/** True when a shape would sit over a content slide's text (inside the margins, or on the page number). */
export function overText(s: Pick<DeckShape, 'x' | 'y' | 'w' | 'h'>): boolean {
  const zones = [
    { x1: 0.5, y1: 0.3, x2: 8.55, y2: 5.05 },
    { x1: 0.4, y1: 5.05, x2: 1.4, y2: 5.5 },
  ];
  return zones.some((r) => s.x < r.x2 && s.x + s.w > r.x1 && s.y < r.y2 && s.y + s.h > r.y1);
}

/**
 * The deck in the event's colours, for when Claude cannot design it: its brand colour with PIC
 * yellow, arches and rings, the calls grouped by who they call on.
 */
export function fallbackDesign(brandColor: string | null, calls: CallToAction[]): DeckDesign {
  const primary = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : PIC_NAVY;
  const shape = (kind: ShapeKind, x: number, y: number, w: number, h: number, colour: ColourRole): DeckShape => ({ kind, x, y, w, h, colour, rotate: 0, flipH: false, flipV: false, transparency: 0 });
  return {
    rationale: "The event's colour with PIC yellow, arches and rings.",
    palette: { primary, secondary: '#F5C400', accent: '#F5C400', background: tint(primary, 0.96), surface: '#FFFFFF', text: readable('#FFFFFF', primary, 7), muted: '#555B6E' },
    headingFont: 'Arial Black',
    bodyFont: 'Garamond',
    uppercaseTitles: true,
    deckTitle: 'Calls to action',
    deckSubtitle: '',
    layouts: { cover: 'arch', summary: 'stats', section: 'cards', closing: 'circle' },
    decor: {
      cover: [shape('ellipse', 1.1, 1.7, 7.8, 8, 'secondary')],
      content: [shape('rings', 8.9, 4.5, 2.2, 2.2, 'secondary')],
      closing: [shape('ellipse', 5.3, -0.6, 7, 7, 'primary'), shape('ellipse', 6.2, 0, 5.6, 5.6, 'secondary')],
    },
    summary: { headline: '', points: [] },
    sections: groupCalls(calls).map((g) => ({ title: `Calls to ${g.directedAt}`, intro: null, callIds: g.calls.map((x) => x.id) })),
    nextSteps: [],
  };
}

const DEFAULT_STEPS = [
  { lead: 'Confirm', rest: 'each call with the organisation it names' },
  { lead: 'Agree', rest: 'an owner and a due date for each one' },
  { lead: 'Share', rest: 'this deck with the speakers and partners' },
  { lead: 'Report', rest: 'progress at the next convening' },
];

/**
 * SVG markup as image data pptxgenjs embeds as vector art. It must be a full data URL
 * (`data:image/svg+xml;base64,…`): pptxgenjs loads it into the browser to draw the PNG copy older
 * PowerPoint shows, and without `data:` the browser cannot load it.
 */
export function svgData(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** A slide's backdrop: Claude's SVG artwork over the whole slide, or the design's shapes without it. */
function backdrop(pres: PptxGenJS, d: DeckDesign, s: PptxGenJS.Slide, which: 'cover' | 'content' | 'closing', shapes: DeckShape[]) {
  const art = d.art?.[which];
  if (art) s.addImage({ data: svgData(art), x: 0, y: 0, w: W, h: H, altText: '' });
  else drawShapes(pres, d.palette, s, shapes);
}

/** The design's decorative shapes, drawn in its palette. */
function drawShapes(pres: PptxGenJS, p: DeckDesign['palette'], s: PptxGenJS.Slide, shapes: DeckShape[]) {
  for (const sh of shapes) {
    const colour = c(p[sh.colour]);
    if (sh.kind === 'rings') {
      const r = Math.min(sh.w, sh.h) / 2;
      for (let i = 0; i < 9 && r - i * 0.09 > 0.05; i++) {
        const ri = r - i * 0.09;
        s.addShape(pres.ShapeType.ellipse, {
          x: sh.x + sh.w / 2 - ri,
          y: sh.y + sh.h / 2 - ri,
          w: ri * 2,
          h: ri * 2,
          fill: { type: 'none' },
          line: { color: colour, width: 1, transparency: sh.transparency },
        });
      }
      continue;
    }
    const kind = {
      ellipse: pres.ShapeType.ellipse,
      rect: pres.ShapeType.rect,
      roundRect: pres.ShapeType.roundRect,
      triangle: pres.ShapeType.triangle,
      rtTriangle: pres.ShapeType.rtTriangle,
      diamond: pres.ShapeType.diamond,
    }[sh.kind];
    s.addShape(kind, {
      x: sh.x,
      y: sh.y,
      w: sh.w,
      h: sh.h,
      rotate: sh.rotate,
      flipH: sh.flipH,
      flipV: sh.flipV,
      fill: { color: colour, transparency: sh.transparency },
      line: { type: 'none' },
      ...(sh.kind === 'roundRect' ? { rectRadius: 0.2 } : {}),
    });
  }
}

/** An image fitted inside a box (`contain`) or filling it (`cover`). */
function place(s: PptxGenJS.Slide, img: DeckImage, box: { x: number; y: number; w: number; h: number }, mode: 'contain' | 'cover', alt: string) {
  const scale = mode === 'contain' ? Math.min(box.w / img.w, box.h / img.h) : Math.max(box.w / img.w, box.h / img.h);
  const w = img.w * scale;
  const h = img.h * scale;
  if (mode === 'contain') s.addImage({ data: img.data, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText: alt });
  else s.addImage({ data: img.data, x: box.x, y: box.y, w, h, sizing: { type: 'cover', w: box.w, h: box.h }, altText: alt });
}

/* ----------------------------------------------------------------- slides */

/** Adds the deck's slides to a fresh presentation. */
export function addDeckSlides(pres: PptxGenJS, input: DeckInput): void {
  const { design: d, event } = input;
  const p = d.palette;
  pres.layout = 'LAYOUT_16x9';
  pres.theme = { headFontFace: d.headingFont, bodyFontFace: d.bodyFont };
  pres.title = `${event.name}: ${d.deckTitle}`;

  const byId = new Map(input.calls.filter((x) => x.status === 'approved').map((x) => [x.id, x]));
  const sections = d.sections.map((s) => ({ ...s, calls: s.callIds.map((id) => byId.get(id)).filter((x): x is CallToAction => !!x) })).filter((s) => s.calls.length);
  const approved = sections.flatMap((s) => s.calls);
  const groups = groupCalls(approved);
  const sessionIds = [...new Set(approved.map((x) => x.sessionId))];
  const pledges = approved.filter((x) => x.type === 'pledge').length;

  const title = (t: string) => (d.uppercaseTitles ? t.toUpperCase() : t);
  // text on each colour it can land on, always readable
  const ink = readable(p.background, p.text, 7);
  const inkSurface = readable(p.surface, p.text, 7);
  const mutedSurface = readable(p.surface, p.muted);
  const mutedBg = readable(p.background, p.muted);
  const strong = readable(p.background, p.primary);
  const onPrimary = readable(p.primary, p.surface);
  const onSecondary = readable(p.secondary, p.text);
  const head = { fontFace: d.headingFont, bold: !/Black/.test(d.headingFont), margin: 0, isTextBox: true } as const;
  const body = { fontFace: d.bodyFont, margin: 0, isTextBox: true } as const;

  let page = 1;
  const contentDecor = d.decor.content.filter((sh) => !overText(sh));

  const contentSlide = () => {
    const s = pres.addSlide();
    s.background = { color: c(p.background) };
    backdrop(pres, d, s, 'content', contentDecor);
    page += 1;
    s.addText(String(page), { ...body, x: 0.5, y: 5.15, w: 0.8, h: 0.3, fontSize: 11, color: c(mutedBg) });
    return s;
  };
  const slideTitle = (s: PptxGenJS.Slide, text: string, sub?: string) => {
    s.addText(title(text), { ...head, x: 0.6, y: 0.4, w: 7.9, h: 0.9, fontSize: 26, color: c(ink), valign: 'bottom', fit: 'shrink' });
    if (sub) s.addText(sub, { ...body, x: 0.6, y: 1.35, w: 7.9, h: 0.35, fontSize: 13, color: c(mutedBg), fit: 'shrink' });
  };

  /* -------------------------------------------------------------- cover */
  {
    const s = pres.addSlide();
    const layout = d.layouts.cover === 'photo' && !input.cover ? 'frame' : d.layouts.cover;
    const repeats = (t: string) => [event.shortName, event.name, event.when.slice(-4)].some((part) => part && t.toLowerCase().includes(part.toLowerCase()));
    const subtitle = d.deckSubtitle && !repeats(d.deckSubtitle) ? d.deckSubtitle : `${plural(approved.length, 'call')} to action, approved by the organisers`;
    const lines = (colour: string, muted: string, x: number, y: number, w: number, align: 'left' | 'center') => {
      s.addText(title(d.deckTitle), { ...head, x, y, w, h: 0.8, fontSize: 32, color: c(colour), align, valign: 'middle', fit: 'shrink' });
      s.addText(event.name, { ...body, x, y: y + 0.85, w, h: 0.5, fontSize: 18, color: c(colour), align, fit: 'shrink' });
      s.addText([event.when, event.where].filter(Boolean).join(' · '), { ...body, x, y: y + 1.35, w, h: 0.35, fontSize: 13, color: c(colour), align });
      s.addText(subtitle, {
        ...body,
        x,
        y: y + 1.72,
        w,
        h: 0.35,
        fontSize: 12,
        italic: true,
        color: c(muted),
        align,
        fit: 'shrink',
      });
    };
    const logoPlate = (box: { x: number; y: number; w: number; h: number }) => {
      if (!input.logo) return;
      s.addShape(pres.ShapeType.roundRect, { ...box, rectRadius: 0.1, fill: { color: c(p.surface) }, line: { type: 'none' } });
      place(s, input.logo, { x: box.x + 0.1, y: box.y + 0.08, w: box.w - 0.2, h: box.h - 0.16 }, 'contain', `${event.name} logo`);
    };
    if (layout === 'arch') {
      s.background = { color: c(p.primary) };
      backdrop(pres, d, s, 'cover', d.decor.cover);
      s.addShape(pres.ShapeType.ellipse, { x: 1.6, y: -3.4, w: 6.8, h: 7.9, fill: { color: c(p.surface) }, line: { type: 'none' } });
      if (input.logo) place(s, input.logo, { x: 4.3, y: 0.2, w: 1.4, h: 1.0 }, 'contain', `${event.name} logo`);
      lines(inkSurface, mutedSurface, 2.9, 1.25, 4.2, 'center');
    } else if (layout === 'split') {
      s.background = { color: c(p.background) };
      if (input.cover) place(s, input.cover, { x: 5, y: 0, w: 5, h: H }, 'cover', `${event.name} cover`);
      else
        backdrop(
          pres,
          d,
          s,
          'cover',
          d.decor.cover.filter((sh) => sh.x + sh.w > 5),
        );
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 5, h: H, fill: { color: c(p.primary) }, line: { type: 'none' } });
      logoPlate({ x: 0.55, y: 0.45, w: 1.5, h: 1.05 });
      lines(onPrimary, onPrimary, 0.6, 1.9, 4.0, 'left');
    } else if (layout === 'band') {
      s.background = { color: c(p.background) };
      backdrop(pres, d, s, 'cover', d.decor.cover);
      s.addShape(pres.ShapeType.rect, { x: 0, y: 1.45, w: W, h: 2.55, fill: { color: c(p.primary) }, line: { type: 'none' } });
      logoPlate({ x: 0.5, y: 0.22, w: 1.4, h: 1.0 });
      lines(onPrimary, onPrimary, 0.8, 1.55, 8.4, 'left');
    } else {
      // frame, and photo: a plate over the shapes or the cover image
      s.background = { color: c(p.primary) };
      if (layout === 'photo' && input.cover) place(s, input.cover, { x: 0, y: 0, w: W, h: H }, 'cover', `${event.name} cover`);
      backdrop(pres, d, s, 'cover', d.decor.cover);
      const plate = layout === 'photo' ? { x: 0.6, y: 2.5, w: 6.2, h: 2.65 } : { x: 1.3, y: 0.75, w: 7.4, h: 4.1 };
      s.addShape(pres.ShapeType.roundRect, { ...plate, rectRadius: 0.15, fill: { color: c(p.surface) }, line: { type: 'none' } });
      if (layout === 'photo') {
        logoPlate({ x: 0.6, y: 0.45, w: 1.6, h: 1.1 });
        lines(inkSurface, mutedSurface, 0.9, 2.6, 5.6, 'left');
      } else {
        if (input.logo) place(s, input.logo, { x: 4.3, y: 0.9, w: 1.4, h: 0.85 }, 'contain', `${event.name} logo`);
        lines(inkSurface, mutedSurface, 1.7, 1.9, 6.6, 'center');
      }
    }
    s.addNotes(
      `${event.name}. ${plural(approved.length, 'call')} to action from ${plural(sessionIds.length, 'session')}, addressed to ${plural(groups.length, 'organisation or group', 'organisations and groups')}. Design: ${d.rationale}`,
    );
  }

  /* ------------------------------------------------------------ summary */
  {
    const s = contentSlide();
    const stats: [string, string][] = [
      [String(approved.length), approved.length === 1 ? 'call to action' : 'calls to action'],
      [String(groups.length), groups.length === 1 ? 'organisation or group called on' : 'organisations and groups called on'],
      [String(sessionIds.length), sessionIds.length === 1 ? 'session they came from' : 'sessions they came from'],
      [String(pledges), pledges === 1 ? 'pledge made on stage' : 'pledges made on stage'],
    ];
    if (d.layouts.summary === 'statement' && d.summary.headline) {
      slideTitle(s, 'At a glance');
      s.addText(d.summary.headline, { ...head, x: 0.6, y: 1.5, w: 7.9, h: 0.9, fontSize: 22, color: c(strong), valign: 'top', fit: 'shrink' });
      if (d.summary.points.length)
        s.addText(
          d.summary.points.map((pt, i) => ({ text: pt, options: { bullet: { indent: 16 }, breakLine: i < d.summary.points.length - 1 } })),
          { ...body, x: 0.6, y: 2.45, w: 7.9, h: 1.6, fontSize: 15, color: c(ink), valign: 'top', paraSpaceAfter: 6, fit: 'shrink' },
        );
      stats.slice(0, 3).forEach(([value, label], i) => {
        const x = 0.6 + i * 2.65;
        s.addText(value, { ...head, x, y: 4.05, w: 2.5, h: 0.5, fontSize: 24, color: c(strong) });
        s.addText(label, { ...body, x, y: 4.55, w: 2.5, h: 0.45, fontSize: 12, color: c(mutedBg), valign: 'top', fit: 'shrink' });
      });
    } else {
      slideTitle(s, 'At a glance', d.summary.headline || undefined);
      stats.forEach(([value, label], i) => {
        const x = 0.6 + (i % 2) * 3.0;
        const y = 1.85 + Math.floor(i / 2) * 1.6;
        s.addText(value, { ...head, x, y, w: 2.8, h: 0.8, fontSize: 40, color: c(strong) });
        s.addText(label, { ...body, x, y: y + 0.8, w: 2.8, h: 0.55, fontSize: 14, color: c(ink), valign: 'top' });
      });
    }
  }

  /* ---------------------------------------------------- who is called on */
  if (groups.length > 1) {
    const s = contentSlide();
    slideTitle(s, 'Who is called on');
    // a bar chart draws its first bar at the bottom: reversed, the most-called sits on top
    const top = groups.slice(0, 8).reverse();
    s.addChart(
      pres.ChartType.bar,
      [{ name: 'Calls to action', labels: top.map((g) => (g.directedAt.length > 38 ? `${g.directedAt.slice(0, 36)}…` : g.directedAt)), values: top.map((g) => g.calls.length) }],
      {
        x: 0.6,
        y: 1.5,
        w: 7.9,
        h: 3.45,
        barDir: 'bar',
        chartColors: [c(readable(p.background, p.primary, 3))],
        showValue: true,
        dataLabelPosition: 'outEnd',
        dataLabelColor: c(ink),
        dataLabelFontFace: d.bodyFont,
        dataLabelFontSize: 12,
        catAxisLabelColor: c(ink),
        catAxisLabelFontFace: d.bodyFont,
        catAxisLabelFontSize: 12,
        valAxisHidden: true,
        valGridLine: { style: 'none' },
        catGridLine: { style: 'none' },
        showLegend: false,
        barGapWidthPct: 60,
      },
    );
  }

  /* ----------------------------------------------------------- sections */
  const kindLabel = (call: CallToAction) => (call.type === 'pledge' ? 'PLEDGE' : 'RECOMMENDATION');
  const kindFill = (call: CallToAction) => (call.type === 'pledge' ? p.secondary : p.primary);
  const kindInk = (call: CallToAction) => (call.type === 'pledge' ? onSecondary : onPrimary);
  const meta = (call: CallToAction) =>
    [byline(call), input.sessionTitle(call.sessionId), [call.deadline && `By ${call.deadline}`, call.amount].filter(Boolean).join(' · ') || null].filter((m): m is string => !!m);
  const metaRuns = (call: CallToAction) => meta(call).map((m, j, all) => ({ text: m, options: { breakLine: j < all.length - 1, bold: j === 0 && !!byline(call) } }));

  for (const section of sections) {
    const layout = d.layouts.section === 'spotlight' && section.calls.length > 6 ? 'list' : d.layouts.section;
    const pages = spread(section.calls, layout === 'cards' ? 3 : layout === 'list' ? 4 : 1);
    pages.forEach((calls, pg) => {
      const s = contentSlide();
      const sub = pg === 0 && section.intro ? section.intro : `${plural(section.calls.length, 'call')} to action`;
      slideTitle(s, section.title, `${sub}${pages.length > 1 ? ` · ${pg + 1} of ${pages.length}` : ''}`);

      if (layout === 'cards') {
        const w = (7.9 - (calls.length - 1) * 0.3) / calls.length;
        calls.forEach((call, i) => {
          const x = 0.6 + i * (w + 0.3);
          const quoted = calls.length < 3 && !!call.quote;
          s.addShape(pres.ShapeType.rect, { x, y: 1.85, w, h: 0.4, fill: { color: c(kindFill(call)) }, line: { type: 'none' } });
          s.addText(kindLabel(call), { ...head, x: x + 0.18, y: 1.85, w: w - 0.36, h: 0.4, fontSize: 10, color: c(kindInk(call)), valign: 'middle', charSpacing: 1 });
          s.addShape(pres.ShapeType.rect, { x, y: 2.25, w, h: 2.75, fill: { color: c(p.surface) }, line: { color: c(tint(p.primary, 0.8)), width: 1 } });
          s.addText(call.shortText || call.action, { ...body, x: x + 0.18, y: 2.4, w: w - 0.36, h: quoted ? 0.9 : 1.6, fontSize: 16, color: c(inkSurface), valign: 'top', fit: 'shrink' });
          if (quoted) s.addText(`“${call.quote}”`, { ...body, x: x + 0.18, y: 3.35, w: w - 0.36, h: 0.75, fontSize: 13, italic: true, color: c(mutedSurface), valign: 'top', fit: 'shrink' });
          s.addText(metaRuns(call), { ...body, x: x + 0.18, y: 4.1, w: w - 0.36, h: 0.8, fontSize: 11, color: c(mutedSurface), valign: 'bottom', fit: 'shrink' });
        });
      } else if (layout === 'list') {
        const rowH = 0.78;
        calls.forEach((call, i) => {
          const y = 1.85 + i * rowH;
          const dot = { x: 0.75, y: y + (rowH - 0.08 - 0.46) / 2, w: 0.46, h: 0.46 };
          s.addShape(pres.ShapeType.rect, { x: 0.6, y, w: 7.9, h: rowH - 0.08, fill: { color: c(p.surface) }, line: { color: c(tint(p.primary, 0.85)), width: 1 } });
          s.addShape(pres.ShapeType.ellipse, { ...dot, fill: { color: c(kindFill(call)) }, line: { type: 'none' } });
          s.addText(String(section.calls.indexOf(call) + 1), { ...head, ...dot, fontSize: 13, color: c(kindInk(call)), align: 'center', valign: 'middle' });
          const terms = [call.deadline && `By ${call.deadline}`, call.amount].filter(Boolean).join(' · ');
          s.addText([{ text: call.shortText || call.action, options: { breakLine: !!terms } }, ...(terms ? [{ text: terms, options: { fontSize: 11, color: c(mutedSurface) } }] : [])], {
            ...body,
            x: 1.4,
            y: y + 0.05,
            w: 4.4,
            h: rowH - 0.18,
            fontSize: 14,
            color: c(inkSurface),
            valign: 'middle',
            fit: 'shrink',
          });
          const who = call.proposedBy ?? call.proposedByOrganisation;
          s.addText(
            [{ text: `${call.type === 'pledge' ? 'Pledge' : 'Recommendation'}${who ? ` · ${who}` : ''}`, options: { bold: true, breakLine: true } }, { text: input.sessionTitle(call.sessionId) }],
            {
              ...body,
              x: 5.95,
              y: y + 0.05,
              w: 2.45,
              h: rowH - 0.18,
              fontSize: 10,
              color: c(mutedSurface),
              valign: 'middle',
              fit: 'shrink',
            },
          );
        });
      } else {
        const call = calls[0]!;
        s.addShape(pres.ShapeType.rect, { x: 0.6, y: 1.85, w: 1.9, h: 0.38, fill: { color: c(kindFill(call)) }, line: { type: 'none' } });
        s.addText(kindLabel(call), { ...head, x: 0.7, y: 1.85, w: 1.75, h: 0.38, fontSize: 10, color: c(kindInk(call)), valign: 'middle', charSpacing: 1 });
        s.addText(call.shortText || call.action, { ...head, x: 0.6, y: 2.35, w: 7.9, h: 1.3, fontSize: 24, color: c(ink), valign: 'top', fit: 'shrink' });
        if (call.quote) s.addText(`“${call.quote}”`, { ...body, x: 0.6, y: 3.7, w: 7.9, h: 0.75, fontSize: 14, italic: true, color: c(mutedBg), valign: 'top', fit: 'shrink' });
        s.addText(meta(call).join(' · '), { ...body, x: 0.6, y: 4.5, w: 7.9, h: 0.4, fontSize: 12, color: c(mutedBg), fit: 'shrink' });
      }
      s.addNotes(
        calls
          .map((call, i) =>
            [`${i + 1}. ${call.action}`, call.quote && `Said: "${call.quote}"`, byline(call) && `Proposed by ${byline(call)}`, `Session: ${input.sessionTitle(call.sessionId)}`]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n\n'),
      );
    });
  }

  /* ------------------------------------------------ where they came from */
  const bySession = sessionIds
    .map((id) => {
      const from = approved.filter((x) => x.sessionId === id);
      return { title: input.sessionTitle(id), count: from.length, targets: [...new Set(from.map((x) => x.directedAt.trim()))] };
    })
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  chunk(bySession, 7).forEach((rows, pg, all) => {
    const s = contentSlide();
    slideTitle(s, `Where they came from${all.length > 1 ? ` (${pg + 1} of ${all.length})` : ''}`);
    const cell = (text: string, opts: PptxGenJS.TableCellProps = {}) => ({ text, options: { fontFace: d.bodyFont, fontSize: 12, color: c(inkSurface), valign: 'middle' as const, ...opts } });
    const header = ['Session', 'Calls', 'Called on'].map((t, i) =>
      cell(t, { bold: true, color: c(onPrimary), fill: { color: c(p.primary) }, align: i === 1 ? 'center' : 'left', border: { type: 'none' } }),
    );
    const rowsOut = rows.map((r, i) => {
      const fill = { color: c(i % 2 === 0 ? p.surface : tint(p.primary, 0.92)) };
      return [
        cell(r.title, { fill, border: { type: 'none' } }),
        cell(String(r.count), { fill, align: 'center', border: { type: 'none' } }),
        cell(r.targets.join(', '), { fill, border: { type: 'none' } }),
      ];
    });
    s.addTable([header, ...rowsOut], { x: 0.6, y: 1.55, w: 7.9, colW: [3.6, 0.8, 3.5], rowH: 0.42, margin: [0.04, 0.1, 0.04, 0.1] });
  });

  /* -------------------------------------------------------------- close */
  {
    const s = pres.addSlide();
    const steps = d.nextSteps.length ? d.nextSteps : DEFAULT_STEPS;
    const list = (colour: string, x: number, y: number, w: number) =>
      s.addText(
        steps.flatMap((st, i) => [
          { text: st.lead, options: { bold: true, bullet: { indent: 16 } } },
          { text: ` ${st.rest}`, options: { breakLine: i < steps.length - 1 } },
        ]),
        { ...body, x, y, w, h: 2.6, fontSize: 16, color: c(colour), valign: 'top', paraSpaceAfter: 8, fit: 'shrink' },
      );
    s.background = { color: c(p.background) };
    if (d.layouts.closing === 'split') {
      backdrop(
        pres,
        d,
        s,
        'closing',
        d.decor.closing.filter((sh) => sh.x + sh.w > 5.4),
      );
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 5.4, h: H, fill: { color: c(p.primary) }, line: { type: 'none' } });
      s.addText(title('Next steps'), { ...head, x: 0.6, y: 0.9, w: 4.4, h: 0.8, fontSize: 32, color: c(onPrimary) });
      list(onPrimary, 0.6, 1.9, 4.4);
    } else if (d.layouts.closing === 'band') {
      backdrop(pres, d, s, 'closing', d.decor.closing);
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0.9, w: W, h: 3.9, fill: { color: c(p.primary) }, line: { type: 'none' } });
      s.addText(title('Next steps'), { ...head, x: 0.8, y: 1.1, w: 8.4, h: 0.7, fontSize: 30, color: c(onPrimary) });
      list(onPrimary, 0.8, 1.95, 8.4);
    } else {
      backdrop(
        pres,
        d,
        s,
        'closing',
        d.decor.closing.filter((sh) => sh.x >= 5.0),
      );
      // over Claude's artwork the text sits on a plate, whatever colour the art is behind it
      const plated = !!d.art?.closing;
      const textInk = plated ? inkSurface : ink;
      if (plated) s.addShape(pres.ShapeType.roundRect, { x: 0.35, y: 0.55, w: 5.25, h: 4.55, rectRadius: 0.15, fill: { color: c(p.surface) }, line: { type: 'none' } });
      s.addText(title('Next steps'), { ...head, x: 0.6, y: 0.85, w: 4.75, h: 0.8, fontSize: 34, color: c(textInk) });
      list(textInk, 0.6, 1.8, 4.75);
    }
    if (input.logo && d.layouts.closing !== 'band') place(s, input.logo, { x: 0.6, y: 4.35, w: 1.1, h: 0.65 }, 'contain', `${event.name} logo`);
  }
}

/* ------------------------------------------------------ a session's slide */

/** Who a call is for, as the session slide's Actor column: who is called on, or who pledged. */
export const actorOf = (call: Pick<CallToAction, 'directedAt'>) => call.directedAt.trim();
/** The Timeline column: the deadline as said, or that it is still to be agreed. */
export const timelineOf = (call: Pick<CallToAction, 'deadline'>) => call.deadline?.trim() || 'To be agreed';

/** Rows on one session slide; a session with more runs onto a second. */
export const ROWS_PER_SLIDE = 6;

/**
 * One session's calls on a single slide, as the design colours it: the session's name over a
 * table of actor, commitment and timeline. A session with more than eight calls runs onto a second.
 */
export function addSessionSlides(pres: PptxGenJS, input: DeckInput & { session: { title: string; when: string } }): void {
  const { design: d, event, session } = input;
  const p = d.palette;
  pres.layout = 'LAYOUT_16x9';
  pres.theme = { headFontFace: d.headingFont, bodyFontFace: d.bodyFont };
  pres.title = `${session.title}: calls to action`;

  const calls = input.calls.filter((x) => x.status === 'approved');
  const ink = readable(p.background, p.text, 7);
  const inkSurface = readable(p.surface, p.text, 7);
  const mutedSurface = readable(p.surface, p.muted);
  const strong = readable(p.background, p.primary);
  const head = { fontFace: d.headingFont, bold: !/Black/.test(d.headingFont), margin: 0, isTextBox: true } as const;
  const pages = spread(calls, ROWS_PER_SLIDE);

  pages.forEach((rows, pg) => {
    const s = pres.addSlide();
    s.background = { color: c(p.background) };
    backdrop(
      pres,
      d,
      s,
      'content',
      d.decor.content.filter((sh) => !overText(sh)),
    );
    const textX = input.logo ? 1.85 : 0.6;
    if (input.logo) {
      s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 0.3, w: 1.05, h: 0.7, rectRadius: 0.08, fill: { color: c(p.surface) }, line: { type: 'none' } });
      place(s, input.logo, { x: 0.66, y: 0.34, w: 0.93, h: 0.62 }, 'contain', `${event.name} logo`);
    }
    const label = [d.uppercaseTitles ? d.deckTitle.toUpperCase() : d.deckTitle, event.shortName, session.when, d.uppercaseTitles ? plural(calls.length, 'CALL', 'CALLS') : plural(calls.length, 'call')]
      .filter(Boolean)
      .join(' · ');
    s.addText(label, { ...head, x: textX, y: 0.3, w: 8.55 - textX, h: 0.3, fontSize: 11, color: c(strong), charSpacing: 1, fit: 'shrink' });
    s.addText(`${session.title}${pages.length > 1 ? ` (${pg + 1} of ${pages.length})` : ''}`, {
      ...head,
      x: textX,
      y: 0.6,
      w: 8.55 - textX,
      h: 0.75,
      fontSize: 24,
      color: c(ink),
      valign: 'top',
      fit: 'shrink',
    });

    // a real PowerPoint table, so it can be edited, extended and resized; each row grows to fit its text
    const size = rows.length > 4 ? 12 : 13;
    type Border = PptxGenJS.BorderProps;
    const rule = (color: string, pt: number): Border => ({ type: 'solid', pt, color: c(color) });
    const none: Border = { type: 'none' };
    const edges = (bottom: Border): [Border, Border, Border, Border] => [none, none, bottom, none];
    const fill = { color: c(p.surface) };
    const pad: [number, number, number, number] = [0.09, 0.14, 0.09, 0.14];
    const headCell = (text: string, align: 'left' | 'right') => ({
      text,
      options: {
        fontFace: d.bodyFont,
        fontSize: 9,
        bold: true,
        charSpacing: 2,
        color: c(mutedSurface),
        fill,
        align,
        valign: 'bottom' as const,
        margin: pad,
        border: edges(rule(strong, 1.5)),
      },
    });
    const header = [headCell('ACTOR', 'left'), headCell('COMMITMENT', 'left'), headCell('TIMELINE', 'right')];
    const cells = rows.map((call, i) => {
      const last = i === rows.length - 1;
      const border = edges(last ? none : rule(tint(p.primary, 0.82), 0.75));
      const base = { fontFace: d.bodyFont, fontSize: size, fill, valign: 'middle' as const, margin: pad, border };
      const agreed = !!call.deadline?.trim();
      return [
        {
          text: [
            { text: actorOf(call), options: { bold: true, color: c(readable(p.surface, p.primary)), breakLine: call.type === 'pledge' } },
            ...(call.type === 'pledge' ? [{ text: 'Pledged', options: { fontSize: size - 3, color: c(mutedSurface) } }] : []),
          ],
          options: base,
        },
        { text: call.shortText || call.action, options: { ...base, color: c(inkSurface) } },
        { text: timelineOf(call), options: { ...base, fontSize: size - 1, align: 'right' as const, bold: agreed, italic: !agreed, color: c(agreed ? readable(p.surface, p.primary) : mutedSurface) } },
      ];
    });
    s.addTable([header, ...cells], { x: 0.6, y: 1.45, w: 7.95, colW: [2.25, 4.3, 1.4], rowH: [0.4, ...rows.map(() => 0.5)] });
    s.addNotes(rows.map((call, i) => [`${i + 1}. ${call.action}`, call.quote && `Said: "${call.quote}"`, byline(call) && `Proposed by ${byline(call)}`].filter(Boolean).join('\n')).join('\n\n'));
  });
}

/* ------------------------------------------------------------ in the browser */

/** A server image as PNG, with its size: PowerPoint does not take every format a logo comes in. */
export async function toDeckImage(source: DeckImageSource | null): Promise<DeckImage | null> {
  if (!source) return null;
  try {
    const blob = await (await fetch(`data:${source.mediaType};base64,${source.data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL('image/png').replace(/^data:/, ''), w: bitmap.width, h: bitmap.height };
  } catch {
    return null;
  }
}

/** Builds the deck and hands it to the browser to save. */
export async function downloadDeck(input: DeckInput & { session?: { title: string; when: string } }, fileName: string): Promise<void> {
  const { default: Pptx } = await import('pptxgenjs');
  const pres = new Pptx();
  if (input.session) addSessionSlides(pres, { ...input, session: input.session });
  else addDeckSlides(pres, input);
  await pres.writeFile({ fileName });
}
