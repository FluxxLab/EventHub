'use client';

import { DocumentChartBarIcon, PresentationChartBarIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useState } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ChartCard, Legend, Stat } from '@/components/ui/chart-card';
import { ChartTooltip, TipRow } from '@/components/ui/chart-tooltip';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';
import { badgeLogo, printHtml } from '@/lib/badges/print';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count } from '@/lib/format';
import { allHours, dayLabel, hourSeries, peakHour, reportDays, standReportHtml, totals, type LeadsReport, type StandReport } from '@/lib/leads/report';
import { useLeadsReport } from '@/lib/leads/use-report';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-12 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';
// the palette's own tokens, so they follow dark mode: hot reads urgent, warm amber, cold the brand blue
const HOT = 'var(--danger)';
const WARM = 'var(--warning)';
const COLD = 'var(--primary)';

/** The exhibition in numbers: leads per stand, interest, passport visits, the day's rush, and a report for each sponsor. */
export default function ExhibitionPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Exhibition report">
      {(editionId) => <Report edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

/** Leads per hour as bars, with a tooltip on each. */
function HourBars({ series }: { series: { hour: number; leads: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = Math.max(1, ...series.map((s) => s.leads));
  return (
    <div className="relative" onPointerLeave={() => setActive(null)}>
      <div className="flex h-48 items-end gap-1.5" role="img" aria-label={`Leads by hour: ${series.map((s) => `${s.hour}:00 ${s.leads}`).join(', ')}`}>
        {series.map((s, i) => (
          <div key={s.hour} className="flex h-full flex-1 items-end" onPointerEnter={() => setActive(i)}>
            <div className={cn('w-full rounded-t-md transition-colors', active === i ? 'bg-primary' : 'bg-primary/75')} style={{ height: `${(s.leads / top) * 100}%`, minHeight: s.leads ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-center text-[0.6875rem] tabular-nums text-hint" aria-hidden>
        {series.map((s) => (
          <span key={s.hour} className="flex-1">
            {String(s.hour).padStart(2, '0')}
          </span>
        ))}
      </div>
      {active !== null && series[active] && (
        <ChartTooltip x={`${((active + 0.5) / series.length) * 100}%`} y={`${100 - (series[active]!.leads / top) * 100}%`}>
          <span className="block text-on-primary/70">
            {String(series[active]!.hour).padStart(2, '0')}:00–{String(series[active]!.hour + 1).padStart(2, '0')}:00
          </span>
          <TipRow colour="var(--primary)" value={count(series[active]!.leads)} label={series[active]!.leads === 1 ? 'lead' : 'leads'} />
        </ChartTooltip>
      )}
    </div>
  );
}

/** Hot, warm and cold as one bar; the share not rated is the grey left over. */
function InterestBar({ stand }: { stand: StandReport }) {
  if (!stand.leads) return <span className="text-hint">–</span>;
  const part = (n: number, colour: string) => (n ? <span style={{ width: `${(n / stand.leads) * 100}%`, background: colour }} /> : null);
  return (
    <div className="flex w-40 flex-col gap-1" title={`Hot ${stand.hot} · Warm ${stand.warm} · Cold ${stand.cold} · Not rated ${stand.leads - stand.hot - stand.warm - stand.cold}`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken">
        {part(stand.hot, HOT)}
        {part(stand.warm, WARM)}
        {part(stand.cold, COLD)}
      </div>
      <p className="text-xs tabular-nums text-hint">
        {stand.hot} hot · {stand.warm} warm · {stand.cold} cold
      </p>
    </div>
  );
}

function Report({ edition }: { edition: Edition }) {
  const report = useLeadsReport(edition.id);
  const toast = useToast();
  const [day, setDay] = useUrlParam<string>('day', '');

  if (report.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (report.isError) {
    return <ErrorState framed title="The exhibition report could not load" error={report.error} onRetry={() => void report.refetch()} />;
  }

  const r: LeadsReport = report.data;
  const t = totals(r);
  const days = reportDays(r);
  const shownDay = day && days.includes(day) ? day : (days.at(-1) ?? null);
  const reach = r.ticketHolders ? Math.round((r.delegatesScanned / r.ticketHolders) * 100) : 0;

  if (r.stands.length === 0) {
    return (
      <EmptyState
        framed
        icon={PresentationChartBarIcon}
        title="No stands yet"
        body="Add the stands on the Passport page and give each a lead scanner; their numbers appear here as they scan."
        action={
          <Link href="/passport" className={buttonClass({})}>
            Go to Passport
          </Link>
        }
      />
    );
  }

  const printStand = (s: StandReport) =>
    void printHtml(standReportHtml(r, s.boothId, { name: edition.name, logo: badgeLogo() })).catch((e: Error) =>
      toast.push({ title: 'Report not printed', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="card-art grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 lg:grid-cols-4">
        <Stat label="Leads scanned" value={count(t.leads)} changeLabel={`across ${t.stands} stands`} />
        <Stat label="Delegates reached" value={`${reach}%`} changeLabel={`${count(r.delegatesScanned)} of ${count(r.ticketHolders)} scanned at a stand`} />
        <Stat label="Passport visits" value={count(t.stamps)} changeLabel="delegates who scanned a stand" />
        {t.busiest ? (
          // a stand's name, not a figure: Stat's layout with the name set smaller, so it fits and the row stays level
          <div className="flex min-w-0 flex-col gap-2">
            <p className="truncate text-sm leading-5 text-ink">Most leads</p>
            <p className="truncate text-lg font-medium leading-[38px] text-ink" title={t.busiest.name}>
              {t.busiest.name}
            </p>
            <p className="truncate text-sm leading-5 text-hint">{count(t.busiest.leads)} leads</p>
          </div>
        ) : (
          <Stat label="Most leads" value="–" changeLabel="no scans yet" />
        )}
      </div>

      <ChartCard
        title="Leads through the day"
        description="Badges scanned at every stand, by hour (Lagos time)."
        action={days.length > 1 ? <SegmentedTabs label="Day" options={days.map((d) => ({ value: d, label: dayLabel(d) }))} value={shownDay ?? ''} onChange={setDay} /> : undefined}
      >
        {shownDay ? (
          <>
            <HourBars series={hourSeries(allHours(r), shownDay)} />
            <p className="text-xs text-hint">
              Busiest:{' '}
              {peakHour(
                allHours(r).filter((h) => h.day === shownDay),
                false,
              ) ?? '–'}
            </p>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-hint">No badges scanned yet. Bars appear as stands scan.</p>
        )}
      </ChartCard>

      <Panel
        title="Stands"
        count={r.stands.length}
        description="Counts only; each sponsor’s report prints as one page."
        actions={
          <Legend
            direction="row"
            items={[
              { label: 'Hot', colour: HOT },
              { label: 'Warm', colour: WARM },
              { label: 'Cold', colour: COLD },
            ]}
          />
        }
      >
        <div {...tableScroll} className={`relative overflow-x-auto ${tableScrollFocus}`}>
          <table className="w-full min-w-[52rem] border-collapse">
            <thead>
              <tr>
                <th className={th}>Stand</th>
                <th className={cn(th, 'text-right')}>Leads</th>
                <th className={th}>Interest</th>
                <th className={cn(th, 'text-right')}>Notes</th>
                <th className={cn(th, 'text-right')}>Passport visits</th>
                <th className={th}>Busiest hour</th>
                <th className={cn(th, 'text-right')}>
                  <span className="sr-only">Report</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {r.stands.map((s) => (
                <tr key={s.boothId} className={cn(!s.isActive && 'text-hint')}>
                  <td className={td}>
                    <p className={s.isActive ? 'text-ink' : ''}>{s.name}</p>
                    {s.location && <p className="text-xs text-hint">{s.location}</p>}
                  </td>
                  <td className={cn(td, 'text-right text-base font-medium tabular-nums text-ink')}>{count(s.leads)}</td>
                  <td className={td}>
                    <InterestBar stand={s} />
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>{count(s.withNotes)}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{count(s.stamps)}</td>
                  <td className={cn(td, 'tabular-nums text-ink-soft')}>{peakHour(s.byHour, days.length > 1) ?? '–'}</td>
                  <td className={cn(td, 'text-right')}>
                    <button type="button" onClick={() => printStand(s)} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9 whitespace-nowrap' })}>
                      <DocumentChartBarIcon className="size-4" />
                      Sponsor report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
