'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';

import { ChartTooltip, TipRow } from '@/components/ui/chart-tooltip';
import { niceTicks } from '@/lib/dashboard/chart';
import type { DayValue } from '@/lib/dashboard/types';

export const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * One daily series as a line over a soft fill. The crosshair snaps to the nearest day under the
 * pointer (or the arrow keys, once focused) and reads that day's value out.
 */
export function LineChart({ days, format, label }: { days: DayValue[]; format: (value: number) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...days.map((d) => d.value)));
  const top = ticks[ticks.length - 1]!;
  const x = (i: number) => (days.length < 2 ? 50 : (i / (days.length - 1)) * 100);
  const y = (value: number) => 100 - (value / top) * 100;
  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const point = hover === null ? null : days[hover];

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (days.length - 1)));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setHover((was) => Math.min(days.length - 1, Math.max(0, (was ?? (step > 0 ? -1 : days.length)) + step)));
  };

  if (days.length === 0) return <p className="flex h-56 items-center justify-center text-sm text-muted">Nothing recorded yet.</p>;

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3">
      {/* y-axis labels, at the same heights as the gridlines */}
      <div className="relative h-56 w-12 text-right text-xs tabular-nums text-ink/40" aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(tick)}%` }}>
            {format(tick)}
          </span>
        ))}
      </div>
      <div
        className="relative h-56 cursor-crosshair touch-none rounded-sm outline-none"
        tabIndex={0}
        role="img"
        aria-label={`${label}. Use the arrow keys to read each day.`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {ticks.map((tick) => (
            <line key={tick} x1={0} x2={100} y1={y(tick)} y2={y(tick)} stroke="var(--ink)" strokeOpacity={0.05} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${line} L${x(days.length - 1)},100 L${x(0)},100 Z`} fill="var(--chart-1)" fillOpacity={0.08} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {point && hover !== null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-ink/20" style={{ left: `${x(hover)}%` }} aria-hidden />
            <span
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-surface"
              style={{ left: `${x(hover)}%`, top: `${y(point.value)}%` }}
              aria-hidden
            />
            <ChartTooltip x={`${Math.min(92, Math.max(8, x(hover)))}%`} y={`${y(point.value)}%`}>
              <span className="block text-[#fdfdfd]/70">{shortDay(point.day)}</span>
              <TipRow colour="var(--chart-1)" value={format(point.value)} />
            </ChartTooltip>
          </>
        )}
      </div>
      <div />
      <div className="relative mt-2 h-4 text-xs text-ink/40" aria-hidden>
        {days.map((d, i) =>
          // Counted back from the newest day, so the last label never crowds its neighbour.
          (days.length - 1 - i) % labelEvery === 0 ? (
            <span
              key={d.day}
              className="absolute whitespace-nowrap"
              style={{ left: `${x(i)}%`, transform: i === 0 ? 'none' : i === days.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {shortDay(d.day)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
