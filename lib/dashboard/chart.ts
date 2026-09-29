/** The dashboard charts' arithmetic, kept pure so it is tested apart from the SVG. */

/**
 * Evenly spaced axis ticks from 0 up to at least `max`, on a 1/2/5 × 10ⁿ step, so the gridlines
 * land on round numbers. Returns [0, 1] for an all-zero series so the chart still has a scale.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/**
 * The newest half of a daily series against the half before it, as sums, for a "vs previous
 * N days" change. An odd-length series drops its oldest day so both halves cover N days.
 */
export function halves(values: number[]): { recent: number; earlier: number; days: number } {
  const days = Math.floor(values.length / 2);
  const sum = (part: number[]) => part.reduce((total, value) => total + value, 0);
  return {
    recent: sum(values.slice(values.length - days)),
    earlier: sum(values.slice(values.length - 2 * days, values.length - days)),
    days,
  };
}

export type Slice ={ label: string; value: number; share: number; other: boolean };

/**
 * The largest `keep` rows as their own slices, the rest folded into one "Other" slice, so a
 * donut never needs more hues than the palette has. Empty and zero rows are dropped.
 */
export function slices(rows: { label: string; value: number }[], keep = 4): Slice[] {
  const positive = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return [];
  const head = positive.length > keep ? positive.slice(0, keep - 1) : positive;
  const rest = positive.slice(head.length);
  const out = head.map((row) => ({ label: row.label, value: row.value, share: row.value / total, other: false }));
  if (rest.length > 0) {
    const value = rest.reduce((sum, row) => sum + row.value, 0);
    out.push({ label: 'Other', value, share: value / total, other: true });
  }
  return out;
}
