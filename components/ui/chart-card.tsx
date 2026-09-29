'use client';

import { ArrowTrendingDownIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { useState, type ReactNode } from 'react';

import { ChartTooltip, TipRow, usePointerTip } from '@/components/ui/chart-tooltip';
import { cn } from '@/lib/utils';

/** The design system's categorical chart colours, in order. */
export const CHART_COLOURS = ['#51c0ff', '#8b5cf6', '#ff5e5e', '#fe9239', '#525252'] as const;
export const chartColour = (i: number) => CHART_COLOURS[i % CHART_COLOURS.length]!;

/** A chart's card: title and description over a divider, the chart, and an optional footer of actions. */
export function ChartCard({ title, description, action, footer, className, children }: { title: string; description?: ReactNode; action?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn('flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#dcdcdc] bg-[#fdfdfd]', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-[#dcdcdc] px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl font-medium leading-[30px] text-ink">{title}</h2>
          {description && <p className="text-sm leading-5 text-[#525252]">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">{children}</div>
      {footer && <footer className="flex gap-4 border-t border-[#dcdcdc] px-5 py-4">{footer}</footer>}
    </section>
  );
}

/** One figure: its label, the number, and how it moved (green up, red down). */
export function Stat({ label, value, change, changeLabel }: { label: string; value: string; change?: number | null; changeLabel?: string }) {
  const up = (change ?? 0) >= 0;
  const Trend = up ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="truncate text-sm leading-5 text-ink">{label}</p>
      <p className="text-3xl font-medium leading-[38px] tabular-nums text-ink">{value}</p>
      {change !== undefined && change !== null ? (
        <p className={cn('flex items-center gap-1 text-sm leading-5', up ? 'text-[#10a957]' : 'text-[#ff5e5e]')}>
          <Trend className="size-5" />
          {Math.abs(change).toFixed(1)}%{changeLabel && <span className="text-[#7c7c7c]">&nbsp;{changeLabel}</span>}
        </p>
      ) : (
        changeLabel && <p className="truncate text-sm leading-5 text-[#7c7c7c]">{changeLabel}</p>
      )}
    </div>
  );
}

export type Slice = { label: string; value: number };

/** 10px swatches and 12px labels, as a column beside a chart or a row under it. */
export function Legend({ items, direction = 'column' }: { items: { label: string; colour: string; detail?: string }[]; direction?: 'row' | 'column' }) {
  return (
    <ul className={cn('flex gap-4', direction === 'column' ? 'flex-col' : 'flex-wrap')}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs leading-[18px] text-[#525252]">
          <span className="size-2.5 shrink-0" style={{ background: item.colour }} aria-hidden />
          {item.label}
          {item.detail && <span className="tabular-nums text-ink">{item.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shares of a whole as a ring, the legend beside it. Hovering or focusing a segment names it and
 * its share in the middle; the total shows otherwise.
 */
export function DonutChart({ slices, total, format = String, label }: { slices: Slice[]; total?: string; format?: (value: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const { tip, handlers, clear } = usePointerTip<number>();
  const sum = slices.reduce((a, s) => a + s.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const shown = active === null ? null : slices[active];

  return (
    <div className="flex flex-wrap items-center justify-around gap-6">
      <div data-tip-host className="relative size-48 shrink-0" onPointerLeave={clear}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${sum ? Math.round((s.value / sum) * 100) : 0}%`).join(', ')}`}>
          <circle cx={50} cy={50} r={R} fill="none" stroke="#f1f1f1" strokeWidth={14} />
          {sum > 0 &&
            slices.map((s, i) => {
              const length = (s.value / sum) * C;
              const segment = (
                <circle
                  key={s.label}
                  cx={50}
                  cy={50}
                  r={R}
                  fill="none"
                  stroke={chartColour(i)}
                  strokeWidth={active === i ? 17 : 14}
                  strokeDasharray={`${length} ${C - length}`}
                  strokeDashoffset={-offset}
                  className="cursor-default outline-none transition-[stroke-width]"
                  tabIndex={s.value > 0 ? 0 : -1}
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={handlers(i).onPointerMove}
                  onPointerLeave={() => {
                    setActive(null);
                    clear();
                  }}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              );
              offset += length;
              return segment;
            })}
        </svg>
        {tip && slices[tip.item] && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <span className="block text-[#fdfdfd]/70">{slices[tip.item]!.label}</span>
            <TipRow colour={chartColour(tip.item)} value={format(slices[tip.item]!.value)} label={sum ? `${Math.round((slices[tip.item]!.value / sum) * 100)}%` : undefined} />
          </ChartTooltip>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
          {shown ? (
            <>
              <span className="text-xl font-medium tabular-nums text-ink">{sum ? Math.round((shown.value / sum) * 100) : 0}%</span>
              <span className="text-xs text-[#525252]">{shown.label}</span>
            </>
          ) : (
            <>
              <span className="text-xl font-medium tabular-nums text-ink">{total ?? format(sum)}</span>
              <span className="text-xs text-[#525252]">in total</span>
            </>
          )}
        </div>
      </div>
      <Legend items={slices.map((s, i) => ({ label: s.label, colour: chartColour(i), detail: sum ? `${Math.round((s.value / sum) * 100)}%` : undefined }))} />
    </div>
  );
}
