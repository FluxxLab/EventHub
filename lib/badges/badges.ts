/**
 * Name badges. The API keeps each event's design (`GET/PUT /editions/:id/badge-design`) and lists
 * ticket holders with the ticket's signed door QR (`GET /editions/:id/badges`), so a printed
 * badge is the ticket at the gate. The console lays badges out and prints them; the preview is
 * the same HTML the printer gets.
 */

export const BADGE_SIZES = ['a6', '4x3', 'cr80'] as const;
export type BadgeSize = (typeof BADGE_SIZES)[number];

/** Millimetres, as the card is cut. */
export const SIZE_MM: Record<BadgeSize, { w: number; h: number }> = {
  a6: { w: 105, h: 148 },
  '4x3': { w: 101.6, h: 76.2 },
  cr80: { w: 54, h: 85.6 },
};

export const SIZE_LABEL: Record<BadgeSize, string> = {
  a6: 'A6 · 105 × 148 mm',
  '4x3': '4 × 3 in · landscape',
  cr80: 'ID card · 54 × 86 mm',
};

/** How many fit on an A4 sheet, as columns × rows. */
export const SHEET_GRID: Record<BadgeSize, { cols: number; rows: number }> = {
  a6: { cols: 2, rows: 2 },
  '4x3': { cols: 2, rows: 3 },
  cr80: { cols: 3, rows: 3 },
};

export const BADGE_FIELDS = ['photo', 'title', 'organisation', 'country', 'tier', 'code', 'qr'] as const;
export type BadgeField = (typeof BADGE_FIELDS)[number];

export const FIELD_LABEL: Record<BadgeField, string> = {
  photo: 'Photo',
  title: 'Job title',
  organisation: 'Organisation',
  country: 'Country',
  tier: 'Ticket tier band',
  code: 'Ticket code',
  qr: 'Door QR code',
};

/** The parts placed on artwork: the photo, the name with its details, and the QR with the code. */
export const BADGE_PARTS = ['photo', 'who', 'scan'] as const;
export type BadgePart = (typeof BADGE_PARTS)[number];
export const PART_LABEL: Record<BadgePart, string> = { photo: 'Photo', who: 'Name and details', scan: 'QR code' };

/** A part's centre, as fractions of the badge's width and height, and its size (1 is standard). */
export type BadgePlacement = { x: number; y: number; scale: number };
export type BadgeLayout = Record<BadgePart, BadgePlacement>;

/** Whose logo the header carries: the event's (Events > Branding), PIC's, one uploaded for badges, or none. */
export const BADGE_LOGOS = ['event', 'pic', 'custom', 'none'] as const;
export type BadgeLogo = (typeof BADGE_LOGOS)[number];
export const LOGO_LABEL: Record<BadgeLogo, string> = { event: 'Event logo', pic: 'PIC logo', custom: 'Upload one', none: 'No logo' };

/** A coloured header band, or a light header with a coloured rule under it. */
export type BadgeHeaderStyle = 'band' | 'light';

export type BadgeDesign = {
  size: BadgeSize;
  accent: string;
  fields: BadgeField[];
  tierColours: { tier: string; colour: string }[];
  /** Storage key of the organisers' own background; null for the standard layout with its header band. */
  artwork: string | null;
  /** Where each part sits on the artwork; null without artwork. */
  layout: BadgeLayout | null;
  logo: BadgeLogo;
  /** Storage key of a logo uploaded for badges; set only with `logo: 'custom'`. */
  logoKey: string | null;
  /** The header's words; null is the event's short name, empty hides them. */
  heading: string | null;
  headerStyle: BadgeHeaderStyle;
  /** The card behind the name; the text picks white or ink to read on it. */
  background: string;
};

/** PIC's look, as designs saved before logos and colours print (and the API reads them). */
export const DEFAULT_DESIGN: BadgeDesign = {
  size: 'a6',
  accent: '#002d74',
  fields: ['title', 'organisation', 'tier', 'qr'],
  tierColours: [],
  artwork: null,
  layout: null,
  logo: 'pic',
  logoKey: null,
  heading: null,
  headerStyle: 'band',
  background: '#ffffff',
};

/** Where an event's badges start before a design is saved: its brand colour and its logo (Events > Branding). */
export function brandedDesign(event: { brandColor?: string | null; logoUrl?: string | null }): BadgeDesign {
  return { ...DEFAULT_DESIGN, accent: event.brandColor?.toLowerCase() ?? DEFAULT_DESIGN.accent, logo: event.logoUrl ? 'event' : 'pic' };
}

/** Where the parts start on new artwork: stacked down the middle, or side by side on a landscape badge. */
export function defaultLayout(size: BadgeSize): BadgeLayout {
  return size === '4x3'
    ? { photo: { x: 0.16, y: 0.46, scale: 1 }, who: { x: 0.48, y: 0.46, scale: 1 }, scan: { x: 0.83, y: 0.46, scale: 1 } }
    : { photo: { x: 0.5, y: 0.3, scale: 1 }, who: { x: 0.5, y: 0.52, scale: 1 }, scan: { x: 0.5, y: 0.76, scale: 1 } };
}

/** Keeps a dragged part on the badge, and a size within what the API takes. */
export const clampPlacement = (p: BadgePlacement): BadgePlacement => ({
  x: Math.round(Math.min(0.97, Math.max(0.03, p.x)) * 1000) / 1000,
  y: Math.round(Math.min(0.97, Math.max(0.03, p.y)) * 1000) / 1000,
  scale: Math.round(Math.min(2, Math.max(0.5, p.scale)) * 100) / 100,
});

/**
 * How far artwork's shape is from the badge's, as a share (0.02 is 2%). Artwork is printed to
 * fill the badge, so a different shape is cropped at the edges.
 */
export function artworkMismatch(size: BadgeSize, image: { width: number; height: number }): number {
  const { w, h } = SIZE_MM[size];
  return Math.abs(image.width / image.height / (w / h) - 1);
}

/** Pixels for print-quality artwork (300 dpi) at the badge's size. */
export function artworkPixels(size: BadgeSize): { width: number; height: number } {
  const { w, h } = SIZE_MM[size];
  return { width: Math.round((w / 25.4) * 300), height: Math.round((h / 25.4) * 300) };
}

/** A ticket holder's badge, from `GET /editions/:id/badges`. */
export type BadgeHolder = {
  ticketId: string;
  code: string;
  name: string;
  title: string | null;
  organisation: string | null;
  country: string | null;
  /** A short-lived link to their profile photo; null without one. */
  photo: string | null;
  tierName: string;
  ticketTypeId: string;
  section: string;
  quantity: number;
  /** The signed door payload, exactly what the gate scans. */
  qr: string;
  admitted: number;
};

export const HEX = /^#[0-9a-f]{6}$/i;

/** The footer band's colour for a tier: its own, else the accent. */
export function tierColour(design: BadgeDesign, tier: string): string {
  return design.tierColours.find((t) => t.tier === tier)?.colour ?? design.accent;
}

/** Sets a tier's colour; the accent itself means "no colour of its own". */
export function withTierColour(design: BadgeDesign, tier: string, colour: string): BadgeDesign {
  const rest = design.tierColours.filter((t) => t.tier !== tier);
  return { ...design, tierColours: colour.toLowerCase() === design.accent.toLowerCase() ? rest : [...rest, { tier, colour: colour.toLowerCase() }] };
}

/** White or ink, whichever reads better on the colour (WCAG relative luminance). */
export function textOn(hex: string): '#ffffff' | '#292929' {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast with white (1.05 / (l + .05)) against contrast with #292929 (l ≈ .022)
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.072 ? '#ffffff' : '#292929';
}

export const sameDesign = (a: BadgeDesign, b: BadgeDesign) =>
  a.size === b.size &&
  a.accent.toLowerCase() === b.accent.toLowerCase() &&
  a.fields.length === b.fields.length &&
  a.fields.every((f) => b.fields.includes(f)) &&
  JSON.stringify([...a.tierColours].sort((x, y) => x.tier.localeCompare(y.tier))) === JSON.stringify([...b.tierColours].sort((x, y) => x.tier.localeCompare(y.tier))) &&
  a.artwork === b.artwork &&
  JSON.stringify(a.layout) === JSON.stringify(b.layout) &&
  a.logo === b.logo &&
  a.logoKey === b.logoKey &&
  a.heading === b.heading &&
  a.headerStyle === b.headerStyle &&
  a.background.toLowerCase() === b.background.toLowerCase();

/** Holders matching a search (name, organisation or code) and a tier. */
export function filterHolders(holders: BadgeHolder[], search: string, tier: string): BadgeHolder[] {
  const q = search.trim().toLowerCase();
  return holders.filter(
    (h) => (tier === 'all' || h.ticketTypeId === tier) && (!q || h.name.toLowerCase().includes(q) || (h.organisation ?? '').toLowerCase().includes(q) || h.code.toLowerCase().includes(q)),
  );
}

/* ------------------------------------------------------------------ print */

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Name size by length, so a long name stays on two lines. */
const nameSize = (name: string, size: BadgeSize) => {
  const base = { a6: 11, '4x3': 8, cr80: 6 }[size];
  return name.length > 26 ? base * 0.72 : name.length > 18 ? base * 0.85 : base;
};

/** "NE" for Ngozi Eze: shown in place of a photo someone has not added. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1]![0] : '')).toUpperCase();
}

/** One badge's markup; `qrSvg` is the holder's QR as an SVG string. */
export function badgeMarkup(
  holder: Pick<BadgeHolder, 'name' | 'title' | 'organisation' | 'country' | 'tierName' | 'code'> & { photo?: string | null },
  design: BadgeDesign,
  /** `logo`: the picture the design's logo choice comes to (see `badgeLogoFor`), or null for none. */
  event: { shortName: string; logo: string | null; artworkUrl?: string | null },
  qrSvg: string,
): string {
  const has = (f: BadgeField) => design.fields.includes(f);
  const band = tierColour(design, holder.tierName);
  const lines = (['title', 'organisation', 'country'] as const)
    .filter((f) => has(f) && holder[f])
    .map((f) => `<p class="${f}">${escape(holder[f]!)}</p>`)
    .join('');
  const photo = has('photo') ? `<div class="photo" style="color:${design.accent}">${holder.photo ? `<img src="${escape(holder.photo)}" alt="">` : `<span>${escape(initials(holder.name))}</span>`}</div>` : '';
  const who = `<h1 style="font-size:${nameSize(holder.name, design.size)}mm">${escape(holder.name)}</h1>${lines}`;
  const scan = has('qr') || has('code') ? `${has('qr') ? `<div class="qr">${qrSvg}</div>` : ''}${has('code') ? `<p class="code">${escape(holder.code)}</p>` : ''}` : '';
  const footer = has('tier') ? `<footer style="background:${band};color:${textOn(band)}">${escape(holder.tierName)}</footer>` : '';

  if (design.artwork && design.layout && event.artworkUrl) {
    const layout = design.layout;
    const at = (part: BadgePart, inner: string) => {
      const p = layout[part];
      return `<div class="part ${part}" style="left:${p.x * 100}%;top:${p.y * 100}%;transform:translate(-50%,-50%) scale(${p.scale})">${inner}</div>`;
    };
    // an <img>, not a CSS background, so printing waits for it to load
    return `<article class="badge art size-${design.size}"><img class="bg" src="${escape(event.artworkUrl)}" alt="">${photo ? at('photo', photo) : ''}${at('who', who)}${scan ? at('scan', scan) : ''}${footer}</article>`;
  }
  const background = design.background ?? '#ffffff';
  const ink = textOn(background);
  const tinted = background.toLowerCase() !== '#ffffff';
  const heading = design.heading ?? event.shortName;
  const light = design.headerStyle === 'light';
  const logo = event.logo ? `<span class="logo${light ? ' bare' : ''}"><img src="${escape(event.logo)}" alt=""></span>` : '';
  const words = heading ? `<span class="event">${escape(heading)}</span>` : '';
  const header =
    logo || words
      ? light
        ? `<header class="light" style="border-bottom-color:${design.accent};color:${tinted ? ink : design.accent}">${logo}${words}</header>`
        : `<header style="background:${design.accent};color:${textOn(design.accent)}">${logo}${words}</header>`
      : '';
  return `<article class="badge size-${design.size}${tinted ? ' tinted' : ''}" style="background:${background};--ink:${ink};--muted:${ink === '#ffffff' ? 'rgba(255,255,255,.78)' : '#525252'}">
  ${header}
  <div class="body">
    <div class="who">${photo}${who}</div>
    ${scan ? `<div class="scan">${scan}</div>` : ''}
  </div>
  ${footer}
</article>`;
}

/** Styles for badges at true size (mm), for the preview and the printer alike. */
export function badgeCss(size: BadgeSize): string {
  const { w, h } = SIZE_MM[size];
  const small = size === 'cr80';
  const wide = size === '4x3';
  return `*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#292929;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.badge{width:${w}mm;height:${h}mm;display:flex;flex-direction:column;overflow:hidden;background:#fff;color:var(--ink,#292929);break-inside:avoid}
.badge header{display:flex;align-items:center;gap:${small ? 2 : 3}mm;padding:${small ? '2.5mm 3mm' : '4mm 5mm'};flex:none}
.badge .logo{background:#fff;border-radius:${small ? 1 : 1.5}mm;padding:${small ? '.8mm 1.2mm' : '1.2mm 2mm'};display:flex}
.badge header.light{border-bottom:${small ? 1 : 1.5}mm solid}
.badge .logo.bare{background:none;padding:0}
.badge .logo img{height:${small ? 5 : wide ? 6 : 8}mm;width:auto;display:block}
.badge .event{font-size:${small ? 2.8 : 3.6}mm;letter-spacing:.06em;text-transform:uppercase;font-weight:500}
.badge .body{flex:1;display:flex;flex-direction:${wide ? 'row' : 'column'};align-items:${wide ? 'center' : 'stretch'};gap:${small ? 2 : 4}mm;padding:${small ? '3mm' : '5mm'};min-height:0;text-align:${wide ? 'left' : 'center'}}
.badge .who{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0}
.badge h1{margin:0 0 ${small ? 1 : 2}mm;font-weight:500;line-height:1.1;overflow-wrap:anywhere}
.badge .who p{margin:.6mm 0 0;font-size:${small ? 2.6 : 3.8}mm;color:var(--muted,#525252);line-height:1.25;overflow-wrap:anywhere}
.badge .who .organisation{color:var(--ink,#292929);font-weight:500}
.badge .photo{width:${small ? 16 : wide ? 18 : 28}mm;height:${small ? 16 : wide ? 18 : 28}mm;border-radius:50%;overflow:hidden;background:#f1f1f1;display:flex;align-items:center;justify-content:center;margin:0 ${wide ? 'auto 0 0' : 'auto'} ${small ? 2 : 3}mm;flex:none;font-weight:500;font-size:${small ? 5 : wide ? 6 : 9}mm}
.badge .photo img{width:100%;height:100%;object-fit:cover;display:block}
.badge.art{position:relative;display:block}
.badge.art .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.badge.art .part{position:absolute;display:flex;flex-direction:column;align-items:center;text-align:center;transform-origin:center}
.badge.art .part.who{width:${wide ? 46 : 84}%}
.badge.art .photo{margin:0}
.badge.art .part.scan .qr{background:#fff;padding:1.5mm;box-sizing:content-box}
.badge.art footer{position:absolute;left:0;right:0;bottom:0}
.badge .scan{display:flex;flex-direction:column;align-items:center;flex:none}
.badge .qr{width:${small ? 22 : wide ? 34 : 36}mm;height:${small ? 22 : wide ? 34 : 36}mm}
.badge .qr svg{width:100%;height:100%;display:block}
.badge .code{margin:1mm 0 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:${small ? 2.2 : 3}mm;letter-spacing:.08em;color:var(--muted,#525252)}
.badge.tinted .qr{background:#fff;padding:1.2mm;border-radius:1mm}
.badge footer{flex:none;padding:${small ? '1.8mm' : '3mm'};text-align:center;font-size:${small ? 3 : 4.4}mm;font-weight:500;letter-spacing:.08em;text-transform:uppercase}`;
}

export type PrintLayout = 'single' | 'sheet';

/**
 * The print document. `single`: one badge per page at the badge's size, for badge printers.
 * `sheet`: as many as fit on A4, with cut lines, for an office printer and perforated stock.
 */
export function badgesHtml(badges: string[], size: BadgeSize, layout: PrintLayout, title: string): string {
  const { w, h } = SIZE_MM[size];
  const { cols, rows } = SHEET_GRID[size];
  const pages =
    layout === 'single'
      ? badges.map((b) => `<div class="page">${b}</div>`)
      : Array.from({ length: Math.ceil(badges.length / (cols * rows)) }, (_, i) => `<div class="sheet">${badges.slice(i * cols * rows, (i + 1) * cols * rows).join('')}</div>`);
  const pageCss =
    layout === 'single'
      ? `@page{size:${w}mm ${h}mm;margin:0}.page{width:${w}mm;height:${h}mm;break-after:page}`
      : `@page{size:A4;margin:0}.sheet{width:210mm;height:297mm;display:grid;grid-template-columns:repeat(${cols},${w}mm);grid-auto-rows:${h}mm;justify-content:center;align-content:center;break-after:page}.sheet .badge{outline:.2mm dashed #bdbdbd}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>${badgeCss(size)}${pageCss}</style></head><body>${pages.join('\n')}</body></html>`;
}
