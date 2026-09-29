'use client';

import { useCallback, useState, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A chart's tooltip, in the design system's style (fill, grey: #292929 with #FDFDFD 12px text and
 * a 12×6 arrow pointing down at what it describes). Placed at `x`, `y` inside a `relative` parent,
 * as pixels or percentages; it sits above the point, so the pointer never covers it.
 */
export function ChartTooltip({ x, y, children, className }: { x: number | string; y: number | string; children: ReactNode; className?: string }) {
  return (
    <div
      role="tooltip"
      className={cn('pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full pb-2', className)}
      style={{ left: x, top: y }}
    >
      <div className="relative whitespace-nowrap rounded bg-ink px-2 py-1 text-xs leading-[18px] text-[#fdfdfd] shadow-md">
        {children}
        <span aria-hidden className="absolute left-1/2 top-full h-1.5 w-3 -translate-x-1/2 bg-ink [clip-path:polygon(0_0,100%_0,50%_100%)]" />
      </div>
    </div>
  );
}

/** One line of a tooltip: a colour swatch, the number, what it counts. */
export function TipRow({ colour, value, label }: { colour?: string; value: ReactNode; label?: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {colour && <span className="size-2 shrink-0 rounded-[2px]" style={{ background: colour }} aria-hidden />}
      <span className="tabular-nums">{value}</span>
      {label && <span className="text-[#fdfdfd]/70">{label}</span>}
    </span>
  );
}

/**
 * Follows the pointer inside a `relative` element: where the tooltip goes, and what it is about.
 * Spread `handlers(item)` on each hoverable shape; `clear` on the container's pointer leave.
 */
export function usePointerTip<T>() {
  const [tip, setTip] = useState<{ x: number; y: number; item: T } | null>(null);
  const handlers = useCallback(
    (item: T) => ({
      onPointerMove: (event: PointerEvent<Element>) => {
        const host = (event.currentTarget as Element).closest('[data-tip-host]');
        if (!host) return;
        const box = host.getBoundingClientRect();
        setTip({ x: event.clientX - box.left, y: event.clientY - box.top - 6, item });
      },
      onPointerLeave: () => setTip(null),
    }),
    [],
  );
  const clear = useCallback(() => setTip(null), []);
  return { tip, handlers, clear };
}
