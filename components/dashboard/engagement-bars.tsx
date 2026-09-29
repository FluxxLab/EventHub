'use client';

import { useState } from 'react';

import { shortDay } from '@/components/dashboard/line-chart';
import { ChartTooltip, TipRow } from '@/components/ui/chart-tooltip';
import { niceTicks } from '@/lib/dashboard/chart';
import type { DashboardView } from '@/lib/dashboard/types';
import { compact, count } from '@/lib/format';

export const ENGAGEMENT_SERIES = [
  { key: 'questions', label: 'Questions', swatch: 'bg-chart-1' },
  { key: 'pollVotes', label: 'Poll votes', swatch: 'bg-chart-2' },
] as const;

/**
 * Daily questions and poll votes as stacked columns. Each day's column is its own hover and
 * focus target and reads out both series.
 */
export function EngagementBars({ days }: { days: DashboardView['spark']['engagement']['daily'] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...days.map((d) => d.questions + d.pollVotes)));
  const top = ticks[ticks.length - 1]!;
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const at = (value: number) => `${100 - (value / top) * 100}%`;

  if (days.length === 0) return <p className="flex h-56 items-center justify-center text-sm text-muted">No questions or votes yet.</p>;

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3">
      <div className="relative h-56 w-12 text-right text-xs tabular-nums text-ink/40" aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: at(tick) }}>
            {compact(tick)}
          </span>
        ))}
      </div>
      <div className="relative h-56">
        {ticks.map((tick) => (
          <span key={tick} className="absolute inset-x-0 h-px bg-ink/5" style={{ top: at(tick) }} aria-hidden />
        ))}
        <ol className="absolute inset-0 flex items-end gap-[6%] px-[2%]" aria-label="Questions and poll votes per day">
          {days.map((d, i) => (
            <li
              key={d.day}
              tabIndex={0}
              aria-label={`${shortDay(d.day)}: ${count(d.questions)} questions, ${count(d.pollVotes)} poll votes`}
              className={`relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end outline-none transition-opacity ${
                active !== null && active !== i ? 'opacity-50' : ''
              }`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              {/* poll votes stack on questions, a 2px surface gap between them */}
              <span className="rounded-t-sm bg-chart-2" style={{ height: `${(d.pollVotes / top) * 100}%` }} />
              {d.pollVotes > 0 && d.questions > 0 && <span className="h-0.5 shrink-0" />}
              <span className={`bg-chart-1 ${d.pollVotes === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${(d.questions / top) * 100}%` }} />
            </li>
          ))}
        </ol>
        {active !== null && days[active] && (
          <ChartTooltip
            x={`${Math.min(90, Math.max(10, 2 + ((active + 0.5) / days.length) * 96))}%`}
            y={at(days[active].questions + days[active].pollVotes)}
          >
            <span className="block text-[#fdfdfd]/70">{shortDay(days[active].day)}</span>
            {ENGAGEMENT_SERIES.map((series) => (
              <TipRow key={series.key} colour={series.key === 'questions' ? 'var(--chart-1)' : 'var(--chart-2)'} value={count(days[active][series.key])} label={series.label} />
            ))}
          </ChartTooltip>
        )}
      </div>
      <div />
      <div className="mt-2 flex gap-[6%] px-[2%] text-xs text-ink/40" aria-hidden>
        {days.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 whitespace-nowrap text-center">
            {(days.length - 1 - i) % labelEvery === 0 ? shortDay(d.day) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
