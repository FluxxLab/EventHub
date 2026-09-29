/**
 * Tracks and interests: one library of each (`GET /catalog/tracks`, `GET /catalog/interests`),
 * and every event picks the ones it uses (`Edition.trackValues` / `interestValues`). A value is
 * fixed once created; labels can change. `general` is not in the library: every event has it, for
 * plenaries, ceremonies and breaks.
 */

export type TrackOption = { id: string; value: string; label: string; hint: string; sortOrder: number; isActive: boolean };
export type InterestOption = { id: string; value: string; label: string; sortOrder: number; isActive: boolean };
export type TopicOption = TrackOption | InterestOption;

export const GENERAL_TRACK = { value: 'general', label: 'General Programme' } as const;

const byOrder = (a: TopicOption, b: TopicOption) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);

/** What a picker offers: active options, plus retired ones this event still has (so they can be unticked). */
export function pickable<T extends TopicOption>(library: T[], selected: string[]): T[] {
  const chosen = new Set(selected);
  return library.filter((o) => o.isActive || chosen.has(o.value)).sort(byOrder);
}

/** Every active value, what a new event starts with. */
export const activeValues = (library: TopicOption[]) => library.filter((o) => o.isActive).sort(byOrder).map((o) => o.value);

export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function trackLabel(value: string, library: TrackOption[]): string {
  if (value === GENERAL_TRACK.value) return GENERAL_TRACK.label;
  return library.find((t) => t.value === value)?.label ?? value;
}

/** A session's track choices in an event: its tracks in library order, then General Programme. */
export function sessionTrackOptions(library: TrackOption[], trackValues: string[] | undefined): { value: string; label: string }[] {
  const chosen = new Set(trackValues ?? activeValues(library));
  const tracks = library
    .filter((t) => chosen.has(t.value))
    .sort(byOrder)
    .map((t) => ({ value: t.value, label: t.label }));
  return [...tracks, { ...GENERAL_TRACK }];
}

/** Why a new track or interest cannot be added as typed, or null. */
export function newTopicProblem(label: string, library: TopicOption[], noun: 'track' | 'interest'): string | null {
  const name = label.trim();
  if (!name) return `Type the ${noun}'s name.`;
  const max = noun === 'track' ? 80 : 60;
  if (name.length > max) return `Keep it under ${max} characters.`;
  const same = (s: string) => s.trim().toLowerCase() === name.toLowerCase();
  if (noun === 'track' && same(GENERAL_TRACK.label)) return 'Every event already has General Programme.';
  const clash = library.find((o) => same(o.label) || same(o.value));
  if (clash) return clash.isActive ? `“${clash.label}” is already in the list.` : `“${clash.label}” exists but is retired. Restore it in Catalog & settings.`;
  return null;
}

/** "5 tracks · 12 interests". */
export function topicsSummary(trackCount: number, interestCount: number): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return `${plural(trackCount, 'track')} · ${plural(interestCount, 'interest')}`;
}

/**
 * Moving one option up or down the list: the sortOrder writes that achieve it. Equal or gapped
 * orders (options added before ordering mattered) are renumbered 0..n-1 in the same pass.
 */
export function moveOption<T extends TopicOption | { id: string; label: string; sortOrder: number }>(list: T[], id: string, direction: -1 | 1): { id: string; sortOrder: number }[] {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const i = sorted.findIndex((o) => o.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  return sorted.flatMap((o, index) => (o.sortOrder === index ? [] : [{ id: o.id, sortOrder: index }]));
}

/** How many events use each value, for "Used by 3 events". */
export function usageCounts(editions: { trackValues?: string[]; interestValues?: string[] }[], kind: 'track' | 'interest'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of editions) for (const v of (kind === 'track' ? e.trackValues : e.interestValues) ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}
