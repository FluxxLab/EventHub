'use client';

import { useState } from 'react';

import { ChartTooltip, TipRow, usePointerTip } from '@/components/ui/chart-tooltip';
import { Card } from '@/components/ui/card';
import { slices } from '@/lib/dashboard/chart';
import type { DashboardView, TableRow } from '@/lib/dashboard/types';
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const SWATCH = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4'];

const RADIUS = 40;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The 2px surface gap between segments, as a length along the ring. */
const GAP = 1.2;

/**
 * Tickets sold per tier as a donut, with the total in the hole. The legend prints every value
 * and share, so nothing depends on telling the colours apart.
 */
export function TiersCard({ tiers, status }: { tiers: TableRow[]; status: DashboardView['orderStatus'] }) {
  const parts = slices(tiers);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const [active, setActive] = useState<number | null>(null);
  const { tip, handlers, clear } = usePointerTip<number>();

  // Each arc starts where the slices before it end.
  const arcs = parts.map((part, i) => ({
    part,
    i,
    dash: Math.max(0, part.share * CIRCUMFERENCE - (parts.length > 1 ? GAP : 0)),
    offset: parts.slice(0, i).reduce((sum, before) => sum + before.share * CIRCUMFERENCE, 0),
  }));
  const focus = active === null ? null : parts[active];

  return (
    <Card title="Tickets by tier" className="flex flex-col">
      {parts.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted">No tickets sold yet.</p>
      ) : (
        <>
          <div data-tip-host className="relative mx-auto aspect-square w-full max-w-44" onPointerLeave={clear}>
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Tickets sold per tier">
              {arcs.map(({ part, i, dash, offset: start }) => (
                <circle
                  key={part.label}
                  cx={50}
                  cy={50}
                  r={RADIUS}
                  fill="none"
                  stroke={part.other ? 'var(--chart-other)' : COLORS[i]}
                  strokeWidth={active === i ? STROKE + 3 : STROKE}
                  strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                  strokeDashoffset={-start}
                  className="cursor-pointer transition-[stroke-width]"
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={handlers(i).onPointerMove}
                  onPointerLeave={() => {
                    setActive(null);
                    clear();
                  }}
                />
              ))}
            </svg>
            {tip && parts[tip.item] && (
              <ChartTooltip x={tip.x} y={tip.y}>
                <span className="block text-[#fdfdfd]/70">{parts[tip.item]!.label}</span>
                <TipRow colour={parts[tip.item]!.other ? 'var(--chart-other)' : COLORS[tip.item]} value={count(parts[tip.item]!.value)} label={`tickets · ${Math.round(parts[tip.item]!.share * 100)}%`} />
              </ChartTooltip>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
              <p className="text-xl font-medium text-ink">{count(focus ? focus.value : total)}</p>
              <p className="max-w-24 truncate text-xs text-muted">{focus ? focus.label : 'tickets'}</p>
            </div>
          </div>
          <ul className="my-5 flex flex-col gap-2">
            {parts.map((part, i) => (
              <li
                key={part.label}
                className={cn('flex items-center gap-2 rounded-md text-xs', active !== null && active !== i && 'opacity-50')}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
              >
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', part.other ? 'bg-chart-other' : SWATCH[i])} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{part.label}</span>
                <span className="tabular-nums font-medium text-ink">{count(part.value)}</span>
                <span className="w-9 text-right tabular-nums text-muted">{Math.round(part.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-ink/5 pt-4 text-xs">
        {[
          { label: 'Issued', value: status.ticketsIssued },
          { label: 'Admitted', value: status.admitted },
          { label: 'Unclaimed', value: status.unclaimedHolders },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-ink/40">{item.label}</dt>
            <dd className="font-medium text-ink">{count(item.value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
