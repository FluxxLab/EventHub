import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';

/**
 * Calls to action that say the same thing twice: a closing speech repeating a session's promise,
 * or one stretch of captions analysed under two sessions. Each pair can be merged into one, so
 * the deck and report count it once.
 */

const STOP = new Set(
  'a an and are as at be by for from has have in into is it its of on or our that the their them they this to was we will with which who should must would can all more also new be been being so such than then there these those through up use using all'.split(' '),
);

/** The meaningful words of a text: lower case, no stop words, plural "s" dropped. */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return new Set(words);
}

const shared = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;
/** Share of all the words used by either. */
const jaccard = (a: Set<string>, b: Set<string>) => (a.size + b.size ? shared(a, b) / (a.size + b.size - shared(a, b)) : 0);
/** Share of the shorter one's words found in the other. */
const overlap = (a: Set<string>, b: Set<string>) => (Math.min(a.size, b.size) ? shared(a, b) / Math.min(a.size, b.size) : 0);

/** How alike two calls are, 0 to 1: their headlines, and everything they say. */
export function likeness(a: Pick<CallToAction, 'shortText' | 'action'>, b: Pick<CallToAction, 'shortText' | 'action'>): number {
  const all = jaccard(contentWords(`${a.shortText} ${a.action}`), contentWords(`${b.shortText} ${b.action}`));
  const sa = contentWords(a.shortText);
  const sb = contentWords(b.shortText);
  const head = Math.min(sa.size, sb.size) >= 4 ? overlap(sa, sb) : 0;
  return Math.max(all, head * 0.85);
}

export type Repeat = { a: CallToAction; b: CallToAction; score: number };

export const pairKey = (a: string, b: string) => [a, b].sort().join('+');

/**
 * Pairs of calls that look like the same thing said twice, the most alike first. Merged and
 * rejected calls are left out, and so are pairs marked as different.
 */
export function findRepeats(calls: CallToAction[], dismissed: ReadonlySet<string> = new Set(), threshold = 0.5): Repeat[] {
  const live = calls.filter((c) => c.status !== 'merged' && c.status !== 'rejected');
  const out: Repeat[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      const score = likeness(a, b);
      if (score >= threshold) out.push({ a, b, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** The one to keep from a pair: an approved one, else the one with a named speaker, else the earlier. */
export function keeperOf({ a, b }: Pick<Repeat, 'a' | 'b'>): CallToAction {
  const rank = (c: CallToAction) => (c.status === 'approved' ? 2 : 0) + (c.proposedBy ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  return (a.saidAt ?? a.createdAt) <= (b.saidAt ?? b.createdAt) ? a : b;
}

const dismissedKey = (editionId: string) => `repeats-dismissed:${editionId}`;

/** Pairs this browser was told are different, for an event. */
export function loadDismissed(editionId: string): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(dismissedKey(editionId)) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveDismissed(editionId: string, pairs: Set<string>) {
  try {
    localStorage.setItem(dismissedKey(editionId), JSON.stringify([...pairs]));
  } catch {
    // private window or storage full: the pair shows again next time
  }
}
