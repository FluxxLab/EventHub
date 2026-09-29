/**
 * Which page numbers to show: the first and last, the current one with `siblings` either side, and
 * null where a run is skipped (drawn as "…"). A gap of one page shows the page instead of "…".
 */
export function pageItems(page: number, pages: number, siblings = 1): (number | null)[] {
  const keep = new Set<number>([1, pages]);
  for (let n = page - siblings; n <= page + siblings; n++) if (n >= 1 && n <= pages) keep.add(n);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (typeof last === 'number' && n - last === 2) out.push(last + 1);
    else if (typeof last === 'number' && n - last > 2) out.push(null);
    out.push(n);
  }
  return out;
}
