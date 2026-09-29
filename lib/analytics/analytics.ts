import type { Edition } from '@/lib/events/events';

/** `GET /analytics/summary?from&to`: app usage totals, aggregated by the API. */
export type AnalyticsSummary = {
  from: string;
  to: string;
  totalEvents: number;
  /** Distinct delegates who used the app, per day at the venue (Africa/Lagos), zero-filled. */
  activeDelegates: { day: string; count: number }[];
  /** Top 30 screen paths by views. */
  screens: { path: string; views: number }[];
  features: { feature: string; uses: number }[];
  platforms: { ios: number; android: number; web: number };
};

export type Period = { kind: 'event'; editionId: string } | { kind: 'last'; days: 7 | 30 } | { kind: 'custom'; start: string; end: string };

const DAY_MS = 86_400_000;
/** The venue's offset; the API names days in Africa/Lagos, which has no daylight saving. */
const VENUE_OFFSET = '+01:00';

const dayOf = (iso: string) => {
  // the calendar day at the venue
  const d = new Date(Date.parse(iso) + 60 * 60_000);
  return d.toISOString().slice(0, 10);
};
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * The instants to ask for. An event covers its whole days at the venue, plus the day after,
 * when delegates still open the app for materials and certificates.
 */
export function periodRange(period: Period, editions: Edition[], now: number): { from: string; to: string } | null {
  if (period.kind === 'last') return { from: new Date(now - period.days * DAY_MS).toISOString(), to: new Date(now).toISOString() };
  if (period.kind === 'custom') {
    if (!period.start || !period.end) return null;
    return { from: `${period.start}T00:00:00${VENUE_OFFSET}`, to: `${nextDay(period.end)}T00:00:00${VENUE_OFFSET}` };
  }
  const edition = editions.find((e) => e.id === period.editionId);
  if (!edition) return null;
  return { from: `${dayOf(edition.startsAt)}T00:00:00${VENUE_OFFSET}`, to: `${nextDay(nextDay(dayOf(edition.endsAt)))}T00:00:00${VENUE_OFFSET}` };
}

/** The event running or last to end, what the page opens on; otherwise the last 7 days. */
export function defaultPeriod(editions: Edition[], now: number): Period {
  const started = editions.filter((e) => Date.parse(e.startsAt) <= now).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const pick = editions.find((e) => e.isCurrent && Date.parse(e.startsAt) <= now) ?? started[0];
  return pick ? { kind: 'event', editionId: pick.id } : { kind: 'last', days: 7 };
}

/* ------------------------------------------------------------------ figures */

export function peakDay(days: AnalyticsSummary['activeDelegates']): { day: string; count: number } | null {
  return days.reduce<{ day: string; count: number } | null>((best, d) => (d.count > (best?.count ?? 0) ? d : best), null);
}

/** Mean over the days anyone used the app; quiet days before and after do not drag it down. */
export function averageActive(days: AnalyticsSummary['activeDelegates']): number {
  const used = days.filter((d) => d.count > 0);
  return used.length ? Math.round(used.reduce((sum, d) => sum + d.count, 0) / used.length) : 0;
}

export const PLATFORM_LABEL = { ios: 'iPhone', android: 'Android', web: 'Web' } as const;

export function platformShares(platforms: AnalyticsSummary['platforms']): { key: keyof typeof PLATFORM_LABEL; label: string; value: number; share: number }[] {
  const total = platforms.ios + platforms.android + platforms.web;
  return (['android', 'ios', 'web'] as const).map((key) => ({ key, label: PLATFORM_LABEL[key], value: platforms[key], share: total ? platforms[key] / total : 0 }));
}

/* ------------------------------------------------------------------ screens */

const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[0-9a-f]{16,})$/i;

/** The screen a path shows, ids folded: /sessions/9f1c… and /sessions/77ab… are both /sessions/:id. */
export const screenKey = (path: string) =>
  `/${path
    .split('?')[0]!
    .split('/')
    .filter(Boolean)
    .map((s) => (ID_SEGMENT.test(s) ? ':id' : s))
    .join('/')}`;

const words = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** "/" → Home, "/sessions" → Sessions, "/sessions/:id" → Sessions › detail, "/my-pass" → My pass. */
export function screenLabel(key: string): string {
  const parts = key.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  return parts.map((p, i) => (p === ':id' ? 'detail' : i === 0 ? sentence(words(p)) : words(p).toLowerCase())).join(' › ');
}

/** Views per screen, ids folded together, most viewed first. */
export function groupScreens(screens: AnalyticsSummary['screens']): { key: string; label: string; views: number }[] {
  const byKey = new Map<string, number>();
  for (const s of screens) byKey.set(screenKey(s.path), (byKey.get(screenKey(s.path)) ?? 0) + s.views);
  return [...byKey]
    .map(([key, views]) => ({ key, label: screenLabel(key), views }))
    .sort((a, b) => b.views - a.views || a.label.localeCompare(b.label));
}

/** "session_bookmark" → "Session bookmark". */
export const featureLabel = (feature: string) => sentence(words(feature));

/* ------------------------------------------------------------------- export */

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Everything on the page as one CSV, in sections, for the post-summit report. BOM so Excel reads it as UTF-8. */
export function summaryCsv(summary: AnalyticsSummary, title: string): string {
  const rows: (string | number)[][] = [
    [title],
    ['Recorded app events', summary.totalEvents],
    [],
    ['Day', 'Active delegates'],
    ...summary.activeDelegates.map((d) => [d.day, d.count]),
    [],
    ['Screen', 'Views'],
    ...groupScreens(summary.screens).map((s) => [s.label, s.views]),
    [],
    ['Feature', 'Uses'],
    ...summary.features.map((f) => [featureLabel(f.feature), f.uses]),
    [],
    ['Platform', 'Events'],
    ...platformShares(summary.platforms).map((p) => [p.label, p.value]),
  ];
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}
