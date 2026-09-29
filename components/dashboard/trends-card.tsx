'use client';

import { ArrowTrendingDownIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { useState, type KeyboardEvent } from 'react';

import { changeOf } from '@/components/dashboard/change-badge';
import { ENGAGEMENT_SERIES, EngagementBars } from '@/components/dashboard/engagement-bars';
import { LineChart } from '@/components/dashboard/line-chart';
import { Card } from '@/components/ui/card';
import { halves } from '@/lib/dashboard/chart';
import type { DashboardView } from '@/lib/dashboard/types';
import { count, moneyCompact, percentChange } from '@/lib/format';
import { cn } from '@/lib/utils';

type Key = 'revenue' | 'delegates' | 'engagement';

/**
 * The overview panel: three daily trends as a row of figures, each with its change over the
 * last week; the chosen figure's series is charted underneath.
 */
export function TrendsCard({ data }: { data: DashboardView }) {
  const [active, setActive] = useState<Key>('revenue');
  const { revenue, activeDelegates, engagement } = data.spark;
  const engagementTotals = engagement.daily.map((d) => d.questions + d.pollVotes);

  // Online now is live presence from the API (sockets connected across every instance). Hidden at 0,
  // which really does mean nobody has the app open right now.
  const onlineNow = activeDelegates.onlineNow > 0 ? `${count(activeDelegates.onlineNow)} online now` : undefined;
  const metrics: { key: Key; label: string; value: string; series: number[]; note?: string }[] = [
    { key: 'revenue', label: 'Revenue', value: moneyCompact(revenue.total, data.currency), series: revenue.daily.map((d) => d.value) },
    { key: 'delegates', label: 'Active today', value: count(activeDelegates.today), series: activeDelegates.daily.map((d) => d.value), note: onlineNow },
    { key: 'engagement', label: 'Engagement', value: `${engagement.rate.toFixed(1)}%`, series: engagementTotals },
  ];

  // Arrow keys move between the figures, as a tablist should.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const i = metrics.findIndex((m) => m.key === active);
    const next = metrics[(i + (event.key === 'ArrowRight' ? 1 : metrics.length - 1)) % metrics.length]!;
    setActive(next.key);
    document.getElementById(`trend-tab-${next.key}`)?.focus();
  };

  return (
    <Card title="Overview" className="min-w-0">
      <div role="tablist" aria-label="Trend" onKeyDown={onKey} className="flex flex-wrap gap-x-20 gap-y-4">
        {metrics.map((metric) => {
          const split = halves(metric.series);
          const change = split.days > 0 ? changeOf(split.recent, split.earlier) : null;
          const up = change === null || change >= 0;
          const Trend = up ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
          const selected = active === metric.key;
          return (
            <button
              key={metric.key}
              id={`trend-tab-${metric.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="trend-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(metric.key)}
              className={cn('flex flex-col items-start gap-2 border-b-2 pb-2 text-left', selected ? 'border-primary' : 'border-transparent hover:border-border')}
            >
              <span className={cn('text-sm', selected ? 'font-medium text-primary' : 'text-ink')}>{metric.label}</span>
              <span className="text-3xl font-medium text-ink">{metric.value}</span>
              {metric.note ? <span className="text-sm text-muted">{metric.note}</span> : null}
              {change !== null ? (
                <span className="flex items-center gap-1 text-sm">
                  <Trend className={`size-5 ${up ? 'text-success' : 'text-danger'}`} />
                  <span className={up ? 'text-success' : 'text-danger'}>
                    {up ? '+' : '-'}
                    {percentChange(change)}
                  </span>
                  <span className="text-muted">vs previous {split.days} days</span>
                </span>
              ) : (
                <span className="text-sm text-muted">No earlier week to compare</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${active}`} className="mt-6 flex flex-col gap-3">
        {active === 'engagement' && (
          <ul className="flex items-center gap-4 self-end text-xs text-ink">
            {ENGAGEMENT_SERIES.map((series) => (
              <li key={series.key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${series.swatch}`} aria-hidden />
                {series.label}
              </li>
            ))}
          </ul>
        )}
        {active === 'revenue' ? (
          <LineChart days={revenue.daily} format={(v) => moneyCompact(v, data.currency)} label={`Daily revenue, last ${revenue.daily.length} days`} />
        ) : active === 'delegates' ? (
          <LineChart days={activeDelegates.daily} format={count} label={`Daily active delegates, last ${activeDelegates.daily.length} days`} />
        ) : (
          <EngagementBars days={engagement.daily} />
        )}
      </div>
    </Card>
  );
}
