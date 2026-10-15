import type PptxGenJS from 'pptxgenjs';

import type { CallToAction } from './calls-to-action';

/**
 * The calls-to-action deck: the approved calls of one event as a PowerPoint in PIC's look (navy and
 * yellow on cream, heavy capitals over a serif, arches, triangles and rings). Built in the browser
 * from what the organisers approved; every call's full wording and quote go in the speaker notes.
 */

const NAVY = '1F2D8F';
const YELLOW = 'F5C400';
const CREAM = 'FBF8F3';
const PALE = 'FBEFC0';
const MUTED = '545C93';
const WHITE = 'FFFFFF';
const HEAD = 'Arial Black';
const BODY = 'Garamond';

/** Calls on one slide of an organisation's section. */
export const PER_SLIDE = 3;
/** Sessions on one slide of the index. */
const SESSIONS_PER_SLIDE = 8;

export type DeckInput = {
  event: { name: string; shortName: string; when: string; where: string | null };
  /** The approved calls; the deck leaves out anything else it is given. */
  calls: CallToAction[];
  sessionTitle: (sessionId: string | null) => string;
  /** The PIC logo as a data URL (`image/png;base64,…`), or null to leave it off. */
  logo: string | null;
};

export type CallGroup = { directedAt: string; calls: CallToAction[] };

/** The approved calls by who they call on: most-called first, then by name; each group in the order said. */
export function groupCalls(calls: CallToAction[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  for (const c of calls.filter((c) => c.status === 'approved')) {
    const key = c.directedAt.trim().toLowerCase();
    const group = groups.get(key) ?? { directedAt: c.directedAt.trim(), calls: [] };
    group.calls.push(c);
    groups.set(key, group);
  }
  const said = (c: CallToAction) => c.saidAt ?? c.createdAt;
  return [...groups.values()]
    .map((g) => ({ ...g, calls: [...g.calls].sort((a, b) => said(a).localeCompare(said(b))) }))
    .sort((a, b) => b.calls.length - a.calls.length || a.directedAt.localeCompare(b.directedAt));
}

export const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** Splits a list into as few pages as `max` allows, as evenly as it can: 4 at 3 a page is 2 + 2. */
export const spread = <T>(list: T[], max: number): T[][] => chunk(list, Math.ceil(list.length / Math.max(1, Math.ceil(list.length / max))));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Who proposed it, as the card's byline: "Dr Amina Bello, NBS", or null when nobody was named. */
export function byline(c: Pick<CallToAction, 'proposedBy' | 'proposedByOrganisation' | 'alsoProposedBy'>): string | null {
  const who = [c.proposedBy, c.proposedByOrganisation].filter(Boolean).join(', ');
  const others = c.alsoProposedBy.length ? ` and ${plural(c.alsoProposedBy.length, 'other')}` : '';
  return who ? `${who}${others}` : null;
}

/** Adds the deck's slides to a fresh presentation. */
export function addDeckSlides(pres: PptxGenJS, input: DeckInput): void {
  pres.layout = 'LAYOUT_16x9'; // 10 × 5.625 in
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
  pres.title = `${input.event.name}: calls to action`;
  pres.author = 'Policy Innovation Centre';

  const groups = groupCalls(input.calls);
  const approved = groups.flatMap((g) => g.calls);
  const sessionIds = [...new Set(approved.map((c) => c.sessionId))];
  const pledges = approved.filter((c) => c.type === 'pledge').length;
  let page = 1;

  const number = (slide: PptxGenJS.Slide) => {
    page += 1;
    slide.addText(String(page), { x: 8.9, y: 0.3, w: 0.6, h: 0.3, fontFace: HEAD, fontSize: 12, color: NAVY, align: 'right', margin: 0, isTextBox: true });
  };
  /** Concentric rings, the deck's motif: centred on (cx, cy), from `inner` outwards. */
  const rings = (slide: PptxGenJS.Slide, cx: number, cy: number, inner: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      const r = inner + i * 0.09;
      slide.addShape(pres.ShapeType.ellipse, { x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: { type: 'none' }, line: { color, width: 1 } });
    }
  };

  /* -------------------------------------------------------------- cover */
  {
    const s = pres.addSlide();
    s.background = { color: YELLOW };
    s.addShape(pres.ShapeType.ellipse, { x: 1.1, y: 1.7, w: 7.8, h: 8, fill: { color: NAVY }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.ellipse, { x: 2.0, y: -3.1, w: 6.0, h: 7.2, fill: { color: CREAM }, line: { type: 'none' } });
    if (input.logo) s.addImage({ data: input.logo, x: 4.55, y: 0.22, w: 0.9, h: 0.98, altText: 'Policy Innovation Centre' });
    s.addText('CALLS TO ACTION', { x: 2.3, y: 1.45, w: 5.4, h: 0.75, fontFace: HEAD, fontSize: 34, color: NAVY, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(input.event.name, { x: 2.5, y: 2.25, w: 5.0, h: 0.55, fontFace: BODY, fontSize: 20, color: NAVY, align: 'center', valign: 'middle', margin: 0, fit: 'shrink', isTextBox: true });
    s.addText([input.event.when, input.event.where].filter(Boolean).join(' · '), {
      x: 2.5,
      y: 2.8,
      w: 5.0,
      h: 0.35,
      fontFace: BODY,
      fontSize: 14,
      color: NAVY,
      align: 'center',
      margin: 0,
      isTextBox: true,
    });
    s.addText(`${plural(approved.length, 'call')} to action, approved by the organisers`, {
      x: 2.5,
      y: 3.15,
      w: 5.0,
      h: 0.35,
      fontFace: BODY,
      fontSize: 12,
      italic: true,
      color: MUTED,
      align: 'center',
      margin: 0,
      isTextBox: true,
    });
    s.addNotes(
      `${input.event.name}. ${plural(approved.length, 'call')} to action from ${plural(sessionIds.length, 'session')}, addressed to ${plural(groups.length, 'organisation or group', 'organisations and groups')}.`,
    );
  }

  /* ---------------------------------------------------------- at a glance */
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    // the triangles of the summary slide: navy above, yellow below, a navy dot where they meet
    s.addShape(pres.ShapeType.triangle, { x: 5.4, y: 0, w: 2.4, h: 2.85, flipV: true, fill: { color: NAVY }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.rtTriangle, { x: 7.8, y: 0, w: 2.2, h: 2.85, flipH: true, flipV: true, fill: { color: YELLOW }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.triangle, { x: 5.4, y: 2.85, w: 4.6, h: 2.78, fill: { color: YELLOW }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.ellipse, { x: 6.0, y: 3.55, w: 0.7, h: 0.7, fill: { color: NAVY }, line: { type: 'none' } });
    number(s);
    s.addText('AT A GLANCE', { x: 0.6, y: 0.6, w: 4.8, h: 0.7, fontFace: HEAD, fontSize: 30, color: NAVY, margin: 0, isTextBox: true });
    const stats: [string, string][] = [
      [String(approved.length), approved.length === 1 ? 'call to action' : 'calls to action'],
      [String(groups.length), groups.length === 1 ? 'organisation or group called on' : 'organisations and groups called on'],
      [String(sessionIds.length), sessionIds.length === 1 ? 'session they came from' : 'sessions they came from'],
      [String(pledges), pledges === 1 ? 'pledge made on stage' : 'pledges made on stage'],
    ];
    stats.forEach(([value, label], i) => {
      const x = 0.6 + (i % 2) * 2.35;
      const y = 1.6 + Math.floor(i / 2) * 1.75;
      s.addText(value, { x, y, w: 2.2, h: 0.85, fontFace: HEAD, fontSize: 44, color: NAVY, margin: 0, isTextBox: true });
      s.addText(label, { x, y: y + 0.85, w: 2.1, h: 0.6, fontFace: BODY, fontSize: 15, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
    });
  }

  /* ------------------------------------------------------ who is called on */
  if (groups.length > 1) {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    rings(s, 10, 5.625, 0.4, 9, YELLOW);
    number(s);
    s.addText('WHO IS CALLED ON', { x: 0.6, y: 0.6, w: 8.2, h: 0.7, fontFace: HEAD, fontSize: 28, color: NAVY, margin: 0, isTextBox: true });
    // a bar chart draws its first bar at the bottom: reversed, the most-called sits on top
    const top = groups.slice(0, 8).reverse();
    s.addChart(
      pres.ChartType.bar,
      [{ name: 'Calls to action', labels: top.map((g) => (g.directedAt.length > 38 ? `${g.directedAt.slice(0, 36)}…` : g.directedAt)), values: top.map((g) => g.calls.length) }],
      {
        x: 0.6,
        y: 1.45,
        w: 8.0,
        h: 3.75,
        barDir: 'bar',
        chartColors: [NAVY],
        showValue: true,
        dataLabelPosition: 'outEnd',
        dataLabelColor: NAVY,
        dataLabelFontFace: BODY,
        dataLabelFontSize: 13,
        catAxisLabelColor: NAVY,
        catAxisLabelFontFace: BODY,
        catAxisLabelFontSize: 13,
        valAxisHidden: true,
        valGridLine: { style: 'none' },
        catGridLine: { style: 'none' },
        showLegend: false,
        barGapWidthPct: 60,
      },
    );
    if (groups.length > top.length)
      s.addText(`And ${plural(groups.length - top.length, 'more')}, each in its own section.`, {
        x: 0.6,
        y: 5.15,
        w: 8.2,
        h: 0.3,
        fontFace: BODY,
        fontSize: 12,
        italic: true,
        color: MUTED,
        margin: 0,
        isTextBox: true,
      });
  }

  /* ------------------------------------------------- one section per target */
  for (const group of groups) {
    const pages = spread(group.calls, PER_SLIDE);
    pages.forEach((calls, p) => {
      const s = pres.addSlide();
      s.background = { color: CREAM };
      rings(s, 10, 5.625, 0.4, 9, YELLOW);
      number(s);
      s.addText(`CALLS TO ${group.directedAt.toUpperCase()}`, {
        x: 0.6,
        y: 0.45,
        w: 8.2,
        h: 0.85,
        fontFace: HEAD,
        fontSize: 24,
        color: NAVY,
        valign: 'bottom',
        margin: 0,
        fit: 'shrink',
        isTextBox: true,
      });
      s.addText(`${plural(group.calls.length, 'call')} to action${pages.length > 1 ? ` · ${p + 1} of ${pages.length}` : ''}`, {
        x: 0.6,
        y: 1.35,
        w: 8.2,
        h: 0.3,
        fontFace: BODY,
        fontSize: 13,
        color: MUTED,
        margin: 0,
        isTextBox: true,
      });

      // the cards share the slide's width: three across, or two or one wider
      const w = (8.8 - (calls.length - 1) * 0.3) / calls.length;
      calls.forEach((c, i) => {
        const x = 0.6 + i * (w + 0.3);
        const quoted = calls.length < 3 && !!c.quote;
        s.addShape(pres.ShapeType.rect, { x, y: 1.85, w, h: 0.42, fill: { color: c.type === 'pledge' ? YELLOW : NAVY }, line: { type: 'none' } });
        s.addText(c.type === 'pledge' ? 'PLEDGE' : 'RECOMMENDATION', {
          x: x + 0.18,
          y: 1.85,
          w: w - 0.36,
          h: 0.42,
          fontFace: HEAD,
          fontSize: 10,
          color: c.type === 'pledge' ? NAVY : WHITE,
          valign: 'middle',
          charSpacing: 1,
          margin: 0,
          isTextBox: true,
        });
        s.addShape(pres.ShapeType.rect, { x, y: 2.27, w, h: 2.85, fill: { color: WHITE }, line: { color: PALE, width: 1 } });
        s.addText(c.shortText || c.action, {
          x: x + 0.18,
          y: 2.42,
          w: w - 0.36,
          h: quoted ? 0.9 : 1.75,
          fontFace: BODY,
          fontSize: 16,
          color: NAVY,
          valign: 'top',
          margin: 0,
          fit: 'shrink',
          isTextBox: true,
        });
        // a wide card has room for what was said, in the speaker's words
        if (quoted)
          s.addText(`“${c.quote}”`, { x: x + 0.18, y: 3.35, w: w - 0.36, h: 0.8, fontFace: BODY, fontSize: 14, italic: true, color: MUTED, valign: 'top', margin: 0, fit: 'shrink', isTextBox: true });
        const meta = [byline(c), input.sessionTitle(c.sessionId), [c.deadline && `By ${c.deadline}`, c.amount].filter(Boolean).join(' · ') || null].filter((m): m is string => !!m);
        s.addText(
          meta.map((m, j) => ({ text: m, options: { breakLine: j < meta.length - 1, bold: j === 0 && !!byline(c) } })),
          { x: x + 0.18, y: 4.2, w: w - 0.36, h: 0.82, fontFace: BODY, fontSize: 11, color: MUTED, valign: 'bottom', margin: 0, fit: 'shrink', isTextBox: true },
        );
      });

      s.addNotes(
        calls
          .map((c, i) => [`${i + 1}. ${c.action}`, c.quote && `Said: "${c.quote}"`, byline(c) && `Proposed by ${byline(c)}`, `Session: ${input.sessionTitle(c.sessionId)}`].filter(Boolean).join('\n'))
          .join('\n\n'),
      );
    });
  }

  /* -------------------------------------------------- where they came from */
  const bySession = sessionIds
    .map((id) => {
      const from = approved.filter((c) => c.sessionId === id);
      return { title: input.sessionTitle(id), count: from.length, targets: [...new Set(from.map((c) => c.directedAt.trim()))] };
    })
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  chunk(bySession, SESSIONS_PER_SLIDE).forEach((rows, p, all) => {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    rings(s, 10, 5.625, 0.4, 9, YELLOW);
    number(s);
    s.addText(`WHERE THEY CAME FROM${all.length > 1 ? ` (${p + 1} OF ${all.length})` : ''}`, {
      x: 0.6,
      y: 0.55,
      w: 8.2,
      h: 0.7,
      fontFace: HEAD,
      fontSize: 26,
      color: NAVY,
      margin: 0,
      isTextBox: true,
    });
    const cell = (text: string, opts: PptxGenJS.TableCellProps = {}) => ({ text, options: { fontFace: BODY, fontSize: 13, color: NAVY, valign: 'middle' as const, ...opts } });
    const header = ['Session', 'Calls', 'Called on'].map((t, i) =>
      cell(t, { bold: true, align: i === 1 ? 'center' : 'left', border: [{ type: 'none' }, { type: 'none' }, { pt: 1.5, color: YELLOW }, { type: 'none' }] }),
    );
    const body = rows.map((r, i) => {
      const fill = { color: i % 2 === 0 ? PALE : CREAM };
      return [
        cell(r.title, { fill, border: { type: 'none' } }),
        cell(String(r.count), { fill, align: 'center', border: { type: 'none' } }),
        cell(r.targets.join(', '), { fill, border: { type: 'none' } }),
      ];
    });
    s.addTable([header, ...body], { x: 0.6, y: 1.45, w: 8.8, colW: [4.0, 0.9, 3.9], rowH: 0.38, margin: [0.04, 0.1, 0.04, 0.1] });
  });

  /* ----------------------------------------------------------- next steps */
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    s.addShape(pres.ShapeType.ellipse, { x: 5.3, y: -0.6, w: 7.0, h: 7.0, fill: { color: NAVY }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.ellipse, { x: 6.2, y: 0.0, w: 5.6, h: 5.6, fill: { color: YELLOW }, line: { type: 'none' } });
    rings(s, 9.6, 0.3, 0.5, 12, WHITE);
    s.addText('NEXT STEPS', { x: 0.6, y: 1.0, w: 4.6, h: 0.8, fontFace: HEAD, fontSize: 36, color: NAVY, margin: 0, isTextBox: true });
    const steps: [string, string][] = [
      ['Confirm', ' each call with the organisation it names'],
      ['Agree', ' an owner and a due date for each one'],
      ['Share', ' this deck with the speakers and partners'],
      ['Report', ' progress at the next PIC convening'],
    ];
    s.addText(
      steps.flatMap(([lead, rest], i) => [
        { text: lead, options: { bold: true, bullet: { indent: 16 } } },
        { text: rest, options: { breakLine: i < steps.length - 1 } },
      ]),
      { x: 0.6, y: 2.0, w: 4.6, h: 2.6, fontFace: BODY, fontSize: 16, color: NAVY, valign: 'top', paraSpaceAfter: 8, margin: 0, isTextBox: true },
    );
  }
}

/** Builds the deck and hands it to the browser to save. */
export async function downloadDeck(input: DeckInput): Promise<void> {
  const { default: Pptx } = await import('pptxgenjs');
  const pres = new Pptx();
  addDeckSlides(pres, input);
  await pres.writeFile({ fileName: `${input.event.shortName}-calls-to-action.pptx` });
}

/** The PIC logo as a data URL for the cover, or null if it cannot be read. */
export async function picLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch('/pic-logo.png')).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.replace(/^data:/, '') : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
