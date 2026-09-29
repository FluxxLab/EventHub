'use client';

import { ArrowDownTrayIcon, DevicePhoneMobileIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { LineChart, shortDay } from '@/components/dashboard/line-chart';
import { buttonClass } from '@/components/ui/button';
import { ChartCard, chartColour, DonutChart, Stat } from '@/components/ui/chart-card';
import { ChartTooltip, TipRow } from '@/components/ui/chart-tooltip';
import { Skeleton } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select } from '@/components/ui/select';
import {
  averageActive,
  defaultPeriod,
  featureLabel,
  groupScreens,
  peakDay,
  periodRange,
  platformShares,
  summaryCsv,
  type AnalyticsSummary,
  type Period,
} from '@/lib/analytics/analytics';
import { useAnalyticsSummary } from '@/lib/analytics/use-analytics';
import { useSession } from '@/lib/auth/session';
import { dateRange, type Edition } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import { compact, count } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const LIST_LIMIT = 8;

const weekday = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function periodValue(p: Period): string {
  return p.kind === 'event' ? `event:${p.editionId}` : p.kind === 'last' ? `last:${p.days}` : 'custom';
}

/** A ranked list with a bar under each row, scaled to the top one. */
function Ranked({ title, unit, rows, empty }: { title: string; unit: string; rows: { key: string; label: string; value: number }[]; empty: string }) {
  const [all, setAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const top = rows[0]?.value ?? 0;
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const shown = all ? rows : rows.slice(0, LIST_LIMIT);
  return (
    <ChartCard
      title={title}
      description={`By ${unit}, most first.`}
      footer={
        rows.length > LIST_LIMIT ? (
          <button type="button" onClick={() => setAll(!all)} className={buttonClass({ style: 'soft', color: 'gray', className: 'flex-1' })}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#7c7c7c]">{empty}</p>
      ) : (
        <ol className="grid gap-3">
          {shown.map((r, i) => (
            <li key={r.key} className="grid gap-1">
              <div className="flex items-baseline gap-3 text-sm">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-[#7c7c7c]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink" title={r.key}>
                  {r.label}
                </span>
                <span className="tabular-nums text-[#525252]">{count(r.value)}</span>
              </div>
              <div className="relative ml-7" onPointerEnter={() => setHovered(r.key)} onPointerLeave={() => setHovered(null)}>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]">
                  <div className="h-full rounded-full" style={{ width: `${top ? (r.value / top) * 100 : 0}%`, background: chartColour(0) }} />
                </div>
                {hovered === r.key && (
                  <ChartTooltip x={`${Math.max(6, Math.min(94, top ? (r.value / top) * 100 : 0))}%`} y={0}>
                    <TipRow colour={chartColour(0)} value={count(r.value)} label={`${unit} · ${total ? Math.round((r.value / total) * 100) : 0}% of these`} />
                  </ChartTooltip>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

/** The period's headline figures over the daily chart, in one card (the design's Chart-03 layout). */
function Usage({ data }: { data: AnalyticsSummary }) {
  const peak = peakDay(data.activeDelegates);
  const first = data.activeDelegates[0];
  const last = data.activeDelegates.at(-1);
  return (
    <ChartCard
      title="Delegates using the app"
      description={`${first && last ? `${shortDay(first.day)} – ${shortDay(last.day)}. ` : ''}Each delegate counts once a day, however often they open it.`}
    >
      <div className="grid grid-cols-2 gap-x-12 gap-y-4 sm:flex sm:flex-wrap">
        <Stat label="Busiest day" value={peak ? count(peak.count) : '0'} changeLabel={peak ? `on ${weekday(peak.day)}` : 'no activity'} />
        <Stat label="Average day" value={count(averageActive(data.activeDelegates))} changeLabel="on days in use" />
        <Stat label="App actions" value={compact(data.totalEvents)} changeLabel="screens and features" />
      </div>
      <div className="pt-2">
        {data.totalEvents === 0 ? (
          <p className="flex h-56 items-center justify-center text-center text-sm text-[#7c7c7c]">No app activity in this period. Usage appears here within a minute of delegates opening the app.</p>
        ) : (
          <LineChart days={data.activeDelegates.map((d) => ({ day: d.day, value: d.count }))} format={count} label="Delegates using the app per day" />
        )}
      </div>
    </ChartCard>
  );
}

/** Which phones: the platform split as a ring (the design's Chart-05). */
function Platforms({ data }: { data: AnalyticsSummary }) {
  const shares = platformShares(data.platforms);
  return (
    <ChartCard title="Where they use it" description="App actions by platform.">
      <div className="flex flex-1 items-center">
        <DonutChart slices={shares.map((s) => ({ label: s.label, value: s.value }))} total={compact(data.totalEvents)} label="App actions by platform" />
      </div>
    </ChartCard>
  );
}

export default function AnalyticsPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const editions = useEditions();
  const now = useNow(60_000).getTime();
  const [picked, setPicked] = useState<Period | null>(null);
  const [custom, setCustom] = useState({ start: '', end: '' });

  const list: Edition[] = editions.data ?? [];
  const period = picked ?? (editions.data ? defaultPeriod(list, now) : null);
  // "last N days" is pinned to the minute, so the query key does not change on every render
  const range = period ? periodRange(period, list, Math.floor(now / 60_000) * 60_000) : null;
  const summary = useAnalyticsSummary(range);
  const data = summary.data;
  const edition = period?.kind === 'event' ? list.find((e) => e.id === period.editionId) : undefined;
  const title = edition ? `${edition.shortName}, app usage` : period?.kind === 'last' ? `App usage, last ${period.days} days` : 'App usage';

  const options = [
    ...list.map((e) => ({ value: `event:${e.id}`, label: `${e.shortName} · ${dateRange(e.startsAt, e.endsAt)}` })),
    { value: 'last:7', label: 'Last 7 days' },
    { value: 'last:30', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom dates…' },
  ];
  const choose = (value: string) => {
    if (value.startsWith('event:')) setPicked({ kind: 'event', editionId: value.slice(6) });
    else if (value === 'custom') setPicked({ kind: 'custom', ...custom });
    else setPicked({ kind: 'last', days: value === 'last:30' ? 30 : 7 });
  };
  const exportCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([summaryCsv(data, title)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <PresentationChartLineIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">Analytics are for organisers</p>
      </div>
    );
  }

  const screens = data ? groupScreens(data.screens).map((s) => ({ key: s.key, label: s.label, value: s.views })) : [];
  const features = data ? data.features.map((f) => ({ key: f.feature, label: featureLabel(f.feature), value: f.uses })) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <h1 className="sr-only">Analytics</h1>

      <section aria-labelledby="usage-title" className={cn(cardClass, 'flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4')}>
        <div className="min-w-0 flex-1">
          <h2 id="usage-title" className="flex items-center gap-2 text-base font-medium text-ink">
            <DevicePhoneMobileIcon className="size-5 text-primary" /> How delegates used the app
          </h2>
          <p className="text-sm text-[#7c7c7c]">From the app’s own usage reports. Days are counted at the venue (Lagos time).</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="w-full sm:w-72">
            {period ? <Select label="Period" value={periodValue(period)} options={options} onChange={choose} /> : <Skeleton className="h-10" />}
          </div>
          {period?.kind === 'custom' && (
            <div className="w-full sm:w-72">
              <DateRangePicker
                value={custom}
                onChange={(next) => {
                  setCustom(next);
                  setPicked({ kind: 'custom', ...next });
                }}
              />
            </div>
          )}
          <button type="button" onClick={exportCsv} disabled={!data || data.totalEvents === 0} className={buttonClass({ style: 'soft', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" /> Export CSV
          </button>
        </div>
      </section>

      {editions.isError ? (
        <p role="alert" className={cn(cardClass, 'p-6 text-sm text-danger')}>
          {editions.error.message}
        </p>
      ) : summary.isError ? (
        <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
          <p className="font-medium text-ink">Usage could not load.</p>
          <p className="mt-1 text-sm text-[#7c7c7c]">{summary.error.message}</p>
          <button type="button" onClick={() => void summary.refetch()} className={buttonClass({ className: 'mt-4' })}>
            Try again
          </button>
        </div>
      ) : period?.kind === 'custom' && !range ? (
        <p className={cn(cardClass, 'p-10 text-center text-sm text-[#7c7c7c]')}>Pick the first and last day to see usage.</p>
      ) : !data ? (
        <>
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </>
      ) : (
        <div className={cn('flex flex-col gap-5 transition-opacity', summary.isPlaceholderData && 'opacity-60')} aria-busy={summary.isFetching}>
          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Usage data={data} />
            <Platforms data={data} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Ranked title="Most viewed screens" unit="views" rows={screens} empty="No screens recorded in this period." />
            <Ranked title="Features used" unit="uses" rows={features} empty="No features recorded in this period." />
          </div>
        </div>
      )}
    </div>
  );
}
