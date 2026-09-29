import { z } from 'zod';

/** `GET /editions/:id/booths`: a stand with its code and how many delegates stamped it. */
export type Booth = { id: string; name: string; code: string; location: string | null; isActive: boolean; sortOrder: number; stamps: number; description?: string | null };

/** `GET /editions/:id/passport/draw`: a delegate who stamped every active stand. */
export type DrawEntry = { id: string; name: string; email: string; organisation: string | null; completedAt: string };

/** The API draws at most this many winners at once. */
export const MAX_DRAW = 20;

/** What a stand's QR encodes: the app's scanner opens this and stamps the passport. */
export const stampLink = (code: string) => `picevents://passport/stamp?code=${encodeURIComponent(code)}`;

export const boothSchema = z.object({
  name: z.string().trim().min(1, 'Name the stand.').max(120, 'Keep the name under 120 characters.'),
  location: z.string().trim().max(120, 'Keep the location under 120 characters.'),
  description: z.string().trim().max(2000, 'Keep the description under 2,000 characters.'),
});
export type BoothForm = z.input<typeof boothSchema>;
export const emptyBooth = (): BoothForm => ({ name: '', location: '', description: '' });
export const boothFormOf = (b: Booth): BoothForm => ({ name: b.name, location: b.location ?? '', description: b.description ?? '' });

export function passportTotals(booths: Booth[]): { active: number; total: number; stamps: number; busiest: Booth | null } {
  const active = booths.filter((b) => b.isActive);
  const busiest = [...booths].sort((a, b) => b.stamps - a.stamps)[0] ?? null;
  return { active: active.length, total: booths.length, stamps: booths.reduce((n, b) => n + b.stamps, 0), busiest: busiest?.stamps ? busiest : null };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * A printable page of stand signs, one per A4 page: the stand's name, the QR the app scans, and
 * the code in large type for anyone typing it in instead. `qr` maps a booth id to its QR as SVG.
 */
export function signsHtml(booths: Pick<Booth, 'id' | 'name' | 'code' | 'location'>[], qr: Record<string, string>, event: string): string {
  const pages = booths
    .map(
      (b) => `<section class="sign">
  <p class="event">${escape(event)} · Passport</p>
  <h1>${escape(b.name)}</h1>
  ${b.location ? `<p class="where">${escape(b.location)}</p>` : ''}
  <div class="qr">${qr[b.id] ?? ''}</div>
  <p class="how">Open the PIC Events app, tap Scan and point it here. Or type the code:</p>
  <p class="code">${escape(b.code)}</p>
</section>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Passport stand signs</title><style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, sans-serif; color: #292929; margin: 0; }
  .sign { page-break-after: always; text-align: center; padding-top: 10mm; }
  .event { color: #002d74; font-size: 14pt; letter-spacing: .04em; text-transform: uppercase; margin: 0; }
  h1 { font-size: 40pt; margin: 8mm 0 2mm; font-weight: 500; }
  .where { font-size: 16pt; color: #525252; margin: 0; }
  .qr { width: 110mm; height: 110mm; margin: 12mm auto 8mm; }
  .qr svg { width: 100%; height: 100%; }
  .how { font-size: 14pt; color: #525252; margin: 0; }
  .code { font-family: ui-monospace, monospace; font-size: 44pt; letter-spacing: .2em; margin: 4mm 0 0; color: #002d74; }
</style></head><body>${pages}</body></html>`;
}
