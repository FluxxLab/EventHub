'use client';

import { DocumentChartBarIcon, PresentationChartBarIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ChartCard, Legend, Stat } from '@/components/ui/chart-card';
import { ChartTooltip, TipRow } from '@/components/ui/chart-tooltip';
import { useToast } from '@/components/ui/toaster';
import { badgeLogo, printHtml } from '@/lib/badges/print';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count } from '@/lib/format';
import { allHours, dayLabel, hourSeries, peakHour, reportDays, standReportHtml, totals, type LeadsReport, type StandReport } from '@/lib/leads/report';
import { useLeadsReport } from '@/lib/leads/use-report';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const th = 'h-12 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';
const HOT = '#ff5e5e';
const WARM = '#f2b705';
const COLD = '#51c0ff';

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
      <div className="mt-1.5 flex gap-1.5 text-center text-[11px] tabular-nums text-[#7c7c7c]" aria-hidden>
        {series.map((s) => (
          <span key={s.hour} className="flex-1">
            {String(s.hour).padStart(2, '0')}
          </span>
        ))}
      </div>
      {active !== null && series[active] && (
        <ChartTooltip x={`${((active + 0.5) / series.length) * 100}%`} y={`${100 - (series[active]!.leads / top) * 100}%`}>
          <span className="block text-[#fdfdfd]/70">
            {String(series[active]!.hour).padStart(2, '0')}:00–{String(series[active]!.hour + 1).padStart(2, '0')}:00
          </span>
          <TipRow colour="#002d74" value={count(series[active]!.leads)} label={series[active]!.leads === 1 ? 'lead' : 'leads'} />
        </ChartTooltip>
      )}
    </div>
  );
}

/** Hot, warm and cold as one bar; the share not rated is the grey left over. */
function InterestBar({ stand }: { stand: StandReport }) {
  if (!stand.leads) return <span className="text-[#7c7c7c]">–</span>;
  const part = (n: number, colour: string) => (n ? <span style={{ width: `${(n / stand.leads) * 100}%`, background: colour }} /> : null);
  return (
    <div className="flex w-40 flex-col gap-1" title={`Hot ${stand.hot} · Warm ${stand.warm} · Cold ${stand.cold} · Not rated ${stand.leads - stand.hot - stand.warm - stand.cold}`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#ececec]">
        {part(stand.hot, HOT)}
        {part(stand.warm, WARM)}
        {part(stand.cold, COLD)}
      </div>
      <p className="text-xs tabular-nums text-[#7c7c7c]">
        {stand.hot} hot · {stand.warm} warm · {stand.cold} cold
      </p>
    </div>
  );
}

function Report({ edition }: { edition: Edition }) {
  const report = useLeadsReport(edition.id);
  const toast = useToast();
  const [day, setDay] = useState<string | null>(null);

  if (report.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (report.isError) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">The exhibition report could not load.</p>
        <p className="mt-1 text-sm text-muted">{report.error.message}</p>
        <button type="button" onClick={() => void report.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  const r: LeadsReport = report.data;
  const t = totals(r);
  const days = reportDays(r);
  const shownDay = day && days.includes(day) ? day : (days.at(-1) ?? null);
  const reach = r.ticketHolders ? Math.round((r.delegatesScanned / r.ticketHolders) * 100) : 0;

  if (r.stands.length === 0) {
    return (
      <div className={cn(cardClass, 'flex flex-col items-center gap-3 px-6 py-16 text-center')}>
        <PresentationChartBarIcon className="size-10 text-[#7c7c7c]" strokeWidth={1.25} />
        <p className="font-medium text-ink">No stands yet</p>
        <p className="max-w-md text-sm text-[#7c7c7c]">Add the exhibition stands on the Passport page and give each a lead scanner. Their numbers appear here as they scan.</p>
      </div>
    );
  }

  const printStand = (s: StandReport) =>
    void printHtml(standReportHtml(r, s.boothId, { name: edition.name, logo: badgeLogo() })).catch((e: Error) =>
      toast.push({ title: 'Report not printed', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-5 lg:grid-cols-4">
        <Stat label="Leads scanned" value={count(t.leads)} changeLabel={`across ${t.stands} stands`} />
        <Stat label="Delegates reached" value={`${reach}%`} changeLabel={`${count(r.delegatesScanned)} of ${count(r.ticketHolders)} scanned at a stand`} />
        <Stat label="Passport visits" value={count(t.stamps)} changeLabel="delegates who scanned a stand" />
        <Stat label="Most leads" value={t.busiest?.name ?? '–'} changeLabel={t.busiest ? `${count(t.busiest.leads)} leads` : 'no scans yet'} />
      </div>

      <ChartCard
        title="Leads through the day"
        description="Badges scanned at every stand, by hour (Lagos time)."
        action={
          days.length > 1 ? (
            <div role="tablist" aria-label="Day" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
              {days.map((d) => (
                <button key={d} type="button" role="tab" aria-selected={shownDay === d} onClick={() => setDay(d)} className={cn('rounded-md px-3 py-1 text-sm', shownDay === d ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252]')}>
                  {dayLabel(d)}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {shownDay ? (
          <>
            <HourBars series={hourSeries(allHours(r), shownDay)} />
            <p className="text-xs text-[#7c7c7c]">Busiest: {peakHour(allHours(r).filter((h) => h.day === shownDay), false) ?? '–'}</p>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-[#7c7c7c]">No badges scanned yet. Bars appear as stands scan.</p>
        )}
      </ChartCard>

      <section aria-labelledby="stands-title" className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="stands-title" className="text-base font-medium text-ink">
              Stands
            </h2>
            <p className="text-sm text-[#7c7c7c]">Counts only. Each sponsor’s report is one page to print or save as PDF; their contacts come from their scanner’s download.</p>
          </div>
          <Legend
            direction="row"
            items={[
              { label: 'Hot', colour: HOT },
              { label: 'Warm', colour: WARM },
              { label: 'Cold', colour: COLD },
            ]}
          />
        </header>
        <div className="overflow-x-auto">
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
                <tr key={s.boothId} className={cn(!s.isActive && 'text-[#7c7c7c]')}>
                  <td className={td}>
                    <p className={s.isActive ? 'text-ink' : ''}>{s.name}</p>
                    {s.location && <p className="text-xs text-[#7c7c7c]">{s.location}</p>}
                  </td>
                  <td className={cn(td, 'text-right text-base font-medium tabular-nums text-ink')}>{count(s.leads)}</td>
                  <td className={td}>
                    <InterestBar stand={s} />
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>{count(s.withNotes)}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{count(s.stamps)}</td>
                  <td className={cn(td, 'tabular-nums text-[#525252]')}>{peakHour(s.byHour, days.length > 1) ?? '–'}</td>
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
      </section>
    </div>
  );
}
