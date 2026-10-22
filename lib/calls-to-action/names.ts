import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';

/**
 * The people named on an event's calls to action, with look-alike spellings grouped. Captions
 * mishear surnames and the AI shortens first names, so "Chris Agbajogo" and "Christopher
 * Agbajogu" can both appear: grouped, they can be set to one spelling on every card at once.
 * The rules match the server's (src/calls-to-action/analysis/known-names.ts).
 */

const TITLES = new Set(['dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mister', 'engr', 'engineer', 'hon', 'honourable', 'honorable', 'barr', 'barrister', 'sir', 'madam', 'chief', 'alhaji', 'alhaja', 'rev', 'pastor']);

export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 1 && !TITLES.has(w));
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

const closeSurname = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1));
const closeFirst = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 1);

/** Clearly one person: first and last names match, allowing "Chris" for "Christopher" and a misheard surname. */
export function samePerson(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  if (x.length === 1 || y.length === 1) return x.length === y.length && x[0] === y[0];
  return closeFirst(x[0]!, y[0]!) && closeSurname(x.at(-1)!, y.at(-1)!);
}

/** One spelling of a name and organisation, and the calls that carry it. */
export type Spelling = { name: string; organisation: string | null; ids: string[] };
/** A person: every spelling that looks like them, the most used first. */
export type Person = { spellings: Spelling[]; count: number };

const key = (name: string, organisation: string | null) => `${nameWords(name).join(' ')}|${(organisation ?? '').trim().toLowerCase()}`;

/** Everyone named on the calls (merged ones left out), look-alikes first, then the most named. */
export function peopleOf(calls: CallToAction[]): Person[] {
  const spellings = new Map<string, Spelling>();
  for (const c of calls) {
    const name = c.proposedBy?.trim();
    if (!name || c.status === 'merged') continue;
    const organisation = c.proposedByOrganisation?.trim() || null;
    const k = key(name, organisation);
    const s = spellings.get(k) ?? { name, organisation, ids: [] };
    s.ids.push(c.id);
    spellings.set(k, s);
  }
  const people: Spelling[][] = [];
  for (const s of spellings.values()) {
    const home = people.find((p) => p.some((o) => samePerson(o.name, s.name)));
    if (home) home.push(s);
    else people.push([s]);
  }
  return people
    .map((p) => ({ spellings: p.sort((a, b) => b.ids.length - a.ids.length), count: p.reduce((n, s) => n + s.ids.length, 0) }))
    .sort((a, b) => Number(b.spellings.length > 1) - Number(a.spellings.length > 1) || b.count - a.count || a.spellings[0]!.name.localeCompare(b.spellings[0]!.name));
}

/** The calls whose byline would change if every spelling of a person became `name` and `organisation`. */
export function renameIds(person: Person, name: string, organisation: string | null): string[] {
  const org = organisation?.trim() || null;
  return person.spellings.filter((s) => s.name !== name.trim() || s.organisation !== org).flatMap((s) => s.ids);
}
