import type { Edition } from '@/lib/events/events';
import type { HeroIcon, NavGroup } from '@/lib/nav';

/** `GET /search?q=` (the app's search): matches grouped by kind. The fields the console uses. */
export type SearchResponse = {
  sessions: { id: string; title: string; room: string; day: number; startsAt: string; editionId: string | null; editionName: string | null }[];
  speakers: { id: string; name: string; role: string | null; organisation: string | null }[];
  delegates: { id: string; name: string; title: string | null; organisation: string | null }[];
};

export type ResultKind = 'page' | 'event' | 'session' | 'speaker' | 'delegate';

/** One row in the results: where it goes, and how it reads. */
export type SearchResult = { key: string; kind: ResultKind; title: string; detail: string; href: string; icon?: HeroIcon };
export type ResultGroup = { kind: ResultKind; label: string; results: SearchResult[] };

export const MIN_QUERY = 2;
const PAGE_LIMIT = 6;
const EVENT_LIMIT = 5;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** How well a text matches: its start beats a word's start beats anywhere; 0 is no match. */
export function score(text: string, query: string): number {
  const t = norm(text);
  const q = norm(query.trim());
  if (!q) return 0;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s&/,·-]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
}

/**
 * Console pages this person can open, best match first. With no query, every page in sidebar
 * order, so the palette doubles as a quick way to jump anywhere.
 */
export function matchPages(groups: NavGroup[], query: string): SearchResult[] {
  const pages = groups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.label })));
  const rows = pages.map((p, order) => ({ p, order, s: query.trim() ? Math.max(score(p.label, query), score(p.group, query) - 1) : 2 }));
  // a page matches from the start of a word: "am" is not a reason to offer Programme or Team
  return rows
    .filter((r) => r.s >= 2)
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, query.trim() ? PAGE_LIMIT : pages.length)
    .map(({ p }) => ({ key: `page:${p.href}`, kind: 'page', title: p.label, detail: p.group, href: p.href, icon: p.icon }));
}

/** Events by name, short name or city; the console's own list, so drafts are included. */
export function matchEvents(editions: Edition[], query: string, describe: (e: Edition) => string): SearchResult[] {
  if (query.trim().length < MIN_QUERY) return [];
  return editions
    .map((e) => ({ e, s: Math.max(score(e.name, query), score(e.shortName, query), score(e.city ?? '', query)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || Date.parse(b.e.startsAt) - Date.parse(a.e.startsAt))
    .slice(0, EVENT_LIMIT)
    .map(({ e }) => ({ key: `event:${e.id}`, kind: 'event', title: e.name, detail: describe(e), href: `/programme?edition=${e.id}` }));
}

const q = (value: string) => encodeURIComponent(value);

/** The API's matches as rows, each opening the page that shows it, already filtered to it. */
export function apiResults(data: SearchResponse, include: { delegates: boolean }): Pick<Record<ResultKind, SearchResult[]>, 'session' | 'speaker' | 'delegate'> {
  return {
    session: data.sessions.map((s) => ({
      key: `session:${s.id}`,
      kind: 'session',
      title: s.title,
      detail: [s.editionName, `Day ${s.day}`, s.room].filter(Boolean).join(' · '),
      href: `/programme?${s.editionId ? `edition=${s.editionId}&` : ''}day=${s.day}&q=${q(s.title)}`,
    })),
    speaker: data.speakers.map((s) => ({
      key: `speaker:${s.id}`,
      kind: 'speaker',
      title: s.name,
      detail: [s.role, s.organisation].filter(Boolean).join(', ') || 'Speaker',
      href: `/speakers?q=${q(s.name)}`,
    })),
    delegate: include.delegates
      ? data.delegates.map((d) => ({
          key: `delegate:${d.id}`,
          kind: 'delegate',
          title: d.name,
          detail: [d.title, d.organisation].filter(Boolean).join(', ') || 'Delegate',
          href: `/delegates?q=${q(d.name)}`,
        }))
      : [],
  };
}

export const GROUP_LABEL: Record<ResultKind, string> = { page: 'Pages', event: 'Events', session: 'Sessions', speaker: 'Speakers', delegate: 'Delegates' };

/** Non-empty groups in reading order; the flat list is what the arrow keys move through. */
export function groupResults(byKind: Partial<Record<ResultKind, SearchResult[]>>): { groups: ResultGroup[]; flat: SearchResult[] } {
  const order: ResultKind[] = ['page', 'event', 'session', 'speaker', 'delegate'];
  const groups = order.map((kind) => ({ kind, label: GROUP_LABEL[kind], results: byKind[kind] ?? [] })).filter((g) => g.results.length > 0);
  return { groups, flat: groups.flatMap((g) => g.results) };
}

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export const shortcutLabel = (platform: string) => (/mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K');
