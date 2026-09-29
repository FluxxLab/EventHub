/**
 * The exhibition report (`GET /editions/:id/leads/report`): counts per stand, by hour, with no
 * personal details, for organisers and for a one-page report to each sponsor.
 */

export type LeadHour = { day: string; hour: number; leads: number };

export type StandReport = {
  boothId: string;
  name: string;
  location: string | null;
  isActive: boolean;
  stamps: number;
  leads: number;
  hot: number;
  warm: number;
  cold: number;
  withNotes: number;
  byHour: LeadHour[];
};

export type LeadsReport = { editionId: string; ticketHolders: number; delegatesScanned: number; stands: StandReport[] };

/** Every day with a lead, in order. */
export const reportDays = (r: Pick<LeadsReport, 'stands'>) => [...new Set(r.stands.flatMap((s) => s.byHour.map((h) => h.day)))].sort();

/** Leads per hour of one day, over the hours that had any at any stand that day (at least 9 to 17). */
export function hourSeries(hours: LeadHour[], day: string, allHours: LeadHour[] = hours): { hour: number; leads: number }[] {
  const that = allHours.filter((h) => h.day === day).map((h) => h.hour);
  const from = Math.min(9, ...that);
  const to = Math.max(17, ...that);
  const counts = new Map<number, number>();
  for (const h of hours) if (h.day === day) counts.set(h.hour, (counts.get(h.hour) ?? 0) + h.leads);
  return Array.from({ length: to - from + 1 }, (_, i) => ({ hour: from + i, leads: counts.get(from + i) ?? 0 }));
}

/** Every stand's hours together. */
export const allHours = (r: Pick<LeadsReport, 'stands'>) => r.stands.flatMap((s) => s.byHour);

/** The hour with the most leads (the earliest, on a tie). */
export const peakOf = (hours: LeadHour[]): LeadHour | undefined => [...hours].sort((a, b) => b.leads - a.leads || a.day.localeCompare(b.day) || a.hour - b.hour)[0];

/** The busiest hour, as "13:00–14:00 on 7 Sept", or null without leads. */
export function peakHour(hours: LeadHour[], multiDay: boolean): string | null {
  const top = peakOf(hours);
  if (!top) return null;
  const span = `${String(top.hour).padStart(2, '0')}:00–${String(top.hour + 1).padStart(2, '0')}:00`;
  return multiDay ? `${span} on ${dayLabel(top.day)}` : span;
}

export const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "3rd of 12" by leads; ties share a place. */
export function rankOf(r: Pick<LeadsReport, 'stands'>, boothId: string): { place: number; of: number } | null {
  const stand = r.stands.find((s) => s.boothId === boothId);
  if (!stand) return null;
  return { place: r.stands.filter((s) => s.leads > stand.leads).length + 1, of: r.stands.length };
}

export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export function totals(r: LeadsReport) {
  const sum = (k: 'leads' | 'stamps' | 'hot') => r.stands.reduce((n, s) => n + s[k], 0);
  return { stands: r.stands.length, leads: sum('leads'), stamps: sum('stamps'), hot: sum('hot'), busiest: r.stands.find((s) => s.leads > 0) ?? null };
}

/* ------------------------------------------------------------ sponsor report */

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n = (v: number) => v.toLocaleString('en-GB');

/** Bars by hour as an SVG, for print (no script, no fonts to load). */
function barsSvg(series: { hour: number; leads: number }[]): string {
  const w = 640;
  const h = 180;
  const top = Math.max(1, ...series.map((s) => s.leads));
  const slot = w / series.length;
  const bars = series
    .map((s, i) => {
      const bh = Math.round((s.leads / top) * (h - 40));
      const x = Math.round(i * slot + slot * 0.18);
      const bw = Math.round(slot * 0.64);
      return `<rect x="${x}" y="${h - 22 - bh}" width="${bw}" height="${bh}" rx="3" fill="#002d74"/>${s.leads ? `<text x="${x + bw / 2}" y="${h - 26 - bh}" font-size="11" text-anchor="middle" fill="#292929">${s.leads}</text>` : ''}<text x="${x + bw / 2}" y="${h - 6}" font-size="11" text-anchor="middle" fill="#7c7c7c">${String(s.hour).padStart(2, '0')}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Leads by hour">${bars}</svg>`;
}

/**
 * A one-page report for a stand's sponsor: what the stand brought them, in counts. Print it, or
 * save it as PDF from the print window, and send it with the stand's leads.
 */
export function standReportHtml(r: LeadsReport, boothId: string, event: { name: string; logo: string }): string {
  const s = r.stands.find((x) => x.boothId === boothId)!;
  const days = reportDays({ stands: [s] });
  const rank = rankOf(r, boothId)!;
  const rated = s.hot + s.warm + s.cold;
  const share = r.ticketHolders ? Math.round((s.leads / r.ticketHolders) * 100) : null;
  const peak = peakHour(s.byHour, false);
  const peakDay = days.length > 1 && peakOf(s.byHour) ? dayLabel(peakOf(s.byHour)!.day) : '';
  const stat = (label: string, value: string, hint = '') => `<div class="stat"><p class="label">${label}</p><p class="value">${value}</p>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
  const charts = days.length
    ? days.map((d) => `<section class="chart"><h2>Leads by hour${days.length > 1 ? `, ${escape(dayLabel(d))}` : ''}</h2>${barsSvg(hourSeries(s.byHour, d, allHours(r)))}</section>`).join('')
    : '<p class="none">No badges were scanned at this stand.</p>';
  const bar = (count: number, colour: string) => (rated ? `<span style="width:${(count / rated) * 100}%;background:${colour}"></span>` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(s.name)}: exhibition report</title><style>
@page{size:A4;margin:16mm}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#292929;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #002d74;padding-bottom:12px}
header img{height:52px}
header .event{margin:0;color:#7c7c7c;font-size:13px}
h1{margin:2px 0 0;font-size:26px;font-weight:600}
.where{color:#525252;margin:4px 0 0;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
.stat{border:1px solid #e3e3e3;border-radius:10px;padding:12px}
.label{margin:0;font-size:12px;color:#7c7c7c}.value{margin:4px 0 0;font-size:24px;font-weight:600}.hint{margin:2px 0 0;font-size:11px;color:#7c7c7c}
h2{font-size:15px;margin:22px 0 8px}
.interest{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#f1f1f1}
.legend{display:flex;gap:18px;font-size:12px;color:#525252;margin-top:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.none{color:#7c7c7c}
footer{margin-top:28px;font-size:11px;color:#7c7c7c;border-top:1px solid #e3e3e3;padding-top:8px}
</style></head><body>
<header><img src="${escape(event.logo)}" alt=""><div><p class="event">${escape(event.name)} · Exhibition report</p><h1>${escape(s.name)}</h1>${s.location ? `<p class="where">${escape(s.location)}</p>` : ''}</div></header>
<div class="grid">
${stat('Leads scanned', n(s.leads), share !== null ? `${share}% of all delegates` : '')}
${stat('Rank by leads', `${ordinal(rank.place)}`, `of ${rank.of} stands`)}
${stat('Passport visits', n(s.stamps), 'delegates who scanned the stand')}
${stat('Busiest hour', peak ?? '–', [peakDay, s.withNotes ? `${n(s.withNotes)} leads with notes` : ''].filter(Boolean).join(' · '))}
</div>
<h2>Interest, as your staff rated it</h2>
${
  rated
    ? `<div class="interest">${bar(s.hot, '#ff5e5e')}${bar(s.warm, '#f2b705')}${bar(s.cold, '#51c0ff')}</div><div class="legend"><span><i style="background:#ff5e5e"></i>Hot ${n(s.hot)}</span><span><i style="background:#f2b705"></i>Warm ${n(s.warm)}</span><span><i style="background:#51c0ff"></i>Cold ${n(s.cold)}</span><span>Not rated ${n(s.leads - rated)}</span></div>`
    : '<p class="none">No leads were rated.</p>'
}
${charts}
<footer>Counts only; the contact details of each lead are in the stand’s own download. Across the exhibition, ${n(r.delegatesScanned)} of ${n(r.ticketHolders)} delegates were scanned by at least one stand. Prepared ${escape(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))} by the Policy Innovation Centre.</footer>
</body></html>`;
}
