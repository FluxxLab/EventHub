'use client';

import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useSession } from '@/lib/auth/session';
import { ago } from '@/lib/format';
import {
  detailsOf,
  eventsCsv,
  GROUPS,
  PERIOD_LABEL,
  periodFrom,
  SEVERITY_LABEL,
  tierLabel,
  typeLabel,
  type Group,
  type Period,
  type SecurityEvent,
  type Severity,
} from '@/lib/security/security';
import { useSecurityEvents } from '@/lib/security/use-security';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';

const SEVERITY_ICON = {
  critical: { icon: ShieldExclamationIcon, className: 'bg-danger-soft text-danger' },
  warning: { icon: ExclamationTriangleIcon, className: 'bg-secondary-soft text-gold' },
  info: { icon: InformationCircleIcon, className: 'bg-[#f1f1f1] text-[#7c7c7c]' },
} as const;

const KIND_OPTIONS = [{ value: 'all', label: 'All kinds' }, ...(Object.keys(GROUPS) as Group[]).map((g) => ({ value: g, label: GROUPS[g].label }))];
const SEVERITY_OPTIONS = [{ value: 'all', label: 'Any severity' }, ...(['critical', 'warning', 'info'] as Severity[]).map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))];
const PERIOD_OPTIONS = (Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }));

const exact = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Who({ event }: { event: SecurityEvent }) {
  if (!event.actor) {
    return <span className="text-sm text-[#7c7c7c]">{event.actionId ? 'Deleted account' : 'No one signed in'}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-medium text-primary" aria-hidden>
        {initials(event.actor.name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm text-ink">{event.actor.name}</span>
        <span className="block truncate text-xs text-[#7c7c7c]">{tierLabel(event.actor.tier)}</span>
      </span>
    </span>
  );
}

function Row({ event, now, open, onToggle, onPerson }: { event: SecurityEvent; now: number; open: boolean; onToggle: () => void; onPerson: (actor: NonNullable<SecurityEvent['actor']>) => void }) {
  const severity = SEVERITY_ICON[event.severity];
  const details = detailsOf(event.metadata);
  return (
    <li className={cn('border-b border-border last:border-b-0', event.severity === 'critical' && 'bg-danger-soft/30')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-3.5 text-left hover:bg-[#f6f6f6] md:grid-cols-[auto_minmax(0,1fr)_13rem_7rem_auto]"
      >
        <span className={cn('flex size-8 items-center justify-center rounded-full', severity.className)} title={SEVERITY_LABEL[event.severity]}>
          <severity.icon className="size-4" />
          <span className="sr-only">{SEVERITY_LABEL[event.severity]}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{typeLabel(event.type)}</span>
          {/* many audited actions describe themselves with their own name; say it once */}
          {event.description.toLowerCase() !== typeLabel(event.type).toLowerCase() && <span className="block truncate text-sm text-[#7c7c7c]">{event.description}</span>}
        </span>
        <span className="hidden md:block">
          <Who event={event} />
        </span>
        <time dateTime={event.createdAt} title={exact(event.createdAt)} className="hidden whitespace-nowrap text-sm text-[#525252] md:block">
          {ago(event.createdAt, now)}
        </time>
        <ChevronDownIcon className={cn('size-4 text-[#7c7c7c] transition-transform', open && 'rotate-180')} />
        {/* on a phone, who and when go under the event */}
        <span className="col-span-3 col-start-2 flex items-center justify-between gap-3 md:hidden">
          <Who event={event} />
          <time dateTime={event.createdAt} className="whitespace-nowrap text-xs text-[#7c7c7c]">
            {ago(event.createdAt, now)}
          </time>
        </span>
      </button>
      {open && (
        <div className="grid gap-4 bg-[#f6f6f6] px-6 py-4 md:pl-[4.5rem]">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-[#7c7c7c]">When</dt>
            <dd className="text-ink">{exact(event.createdAt)}</dd>
            {event.actor && (
              <>
                <dt className="text-[#7c7c7c]">Who</dt>
                <dd className="text-ink">
                  {event.actor.name} · {event.actor.email} · {tierLabel(event.actor.tier)}
                </dd>
              </>
            )}
            {details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-[#7c7c7c]">{d.label}</dt>
                <dd className="break-words text-ink">{d.value}</dd>
              </div>
            ))}
            <dt className="text-[#7c7c7c]">Event ID</dt>
            <dd className="break-all font-mono text-xs text-[#525252]">{event.id}</dd>
          </dl>
          {event.actor && (
            <div>
              <button type="button" onClick={() => onPerson(event.actor!)} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Show only {event.actor.name.split(' ')[0]}’s activity
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function SecurityLogPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const now = useNow(30_000).getTime();
  const [kind, setKind] = useState<Group | 'all'>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [period, setPeriod] = useState<Period>('7');
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // pinned to the minute, so the query key holds still between renders
  const from = periodFrom(period, Math.floor(now / 60_000) * 60_000);
  const log = useSecurityEvents({
    severity: severity === 'all' ? undefined : severity,
    types: kind === 'all' ? undefined : GROUPS[kind].types,
    actorId: person?.id,
    from,
  });
  const events = log.data?.pages.flat() ?? [];
  const critical = events.filter((e) => e.severity === 'critical').length;
  const warnings = events.filter((e) => e.severity === 'warning').length;
  const filtered = kind !== 'all' || severity !== 'all' || person !== null;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([eventsCsv(events)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-log-${new Date(now).toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <ShieldCheckIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">The security log is for organisers</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="sr-only">Security log</h1>
      <section aria-labelledby="log-title" className={cardClass}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="log-title" className="flex items-center gap-2 text-base font-medium text-ink">
              <ShieldCheckIcon className="size-5 text-primary" /> Security log
            </h2>
            <p className="text-sm text-[#7c7c7c]">Sign-ins, reports and every organiser change, newest first. Kept for the record; nothing here can be edited.</p>
          </div>
          <button type="button" onClick={exportCsv} disabled={events.length === 0} className={buttonClass({ style: 'soft', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" /> Export CSV
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[#f6f6f6] px-6 py-3">
          <div className="w-full sm:w-52">
            <Select label="Kind of event" value={kind} options={KIND_OPTIONS} onChange={(v) => setKind(v as Group | 'all')} />
          </div>
          <div className="w-[calc(50%-0.375rem)] sm:w-40">
            <Select label="Severity" value={severity} options={SEVERITY_OPTIONS} onChange={(v) => setSeverity(v as Severity | 'all')} />
          </div>
          <div className="w-[calc(50%-0.375rem)] sm:w-40">
            <Select label="Period" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
          </div>
          {person && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary bg-primary-soft pl-3 pr-1.5 text-sm text-primary">
              Only {person.name}
              <button type="button" onClick={() => setPerson(null)} aria-label={`Show everyone, not only ${person.name}`} className="flex size-6 items-center justify-center rounded-full hover:bg-primary/10">
                <XMarkIcon className="size-4" />
              </button>
            </span>
          )}
          {log.data && (
            <p className="text-xs text-[#7c7c7c] sm:ml-auto" aria-live="polite">
              {events.length}
              {log.hasNextPage ? '+' : ''} {events.length === 1 ? 'event' : 'events'}
              {critical > 0 && <span className="text-danger"> · {critical} critical</span>}
              {warnings > 0 && <span className="text-gold"> · {warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>}
            </p>
          )}
        </div>

        {/* column heads, desktop only */}
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_13rem_7rem_1rem] gap-x-4 border-b border-border px-6 py-2 text-xs text-[#7c7c7c] md:grid">
          <span />
          <span>Event</span>
          <span>Who</span>
          <span>When</span>
          <span />
        </div>

        {log.isError && !log.data ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">The log could not load.</p>
            <p className="mt-1 text-sm text-[#7c7c7c]">{log.error.message}</p>
            <button type="button" onClick={() => void log.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : !log.data ? (
          <div className="grid gap-3 p-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ShieldCheckIcon className="mx-auto size-8 text-[#bdbdbd]" />
            <p className="mt-2 text-sm text-ink">{filtered ? 'Nothing matches these filters.' : `Nothing recorded ${period === 'any' ? 'yet' : PERIOD_LABEL[period].toLowerCase()}.`}</p>
            {period !== 'any' && <p className="mt-1 text-sm text-[#7c7c7c]">Try a longer period.</p>}
          </div>
        ) : (
          <ol className={cn('transition-opacity', log.isPlaceholderData && 'opacity-60')}>
            {events.map((e) => (
              <Row
                key={e.id}
                event={e}
                now={now}
                open={openId === e.id}
                onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                onPerson={(actor) => {
                  setPerson({ id: actor.id, name: actor.name });
                  setOpenId(null);
                }}
              />
            ))}
          </ol>
        )}

        {log.data && events.length > 0 && (
          <footer className="flex justify-center border-t border-border bg-[#f6f6f6] px-6 py-3">
            {log.hasNextPage ? (
              <button type="button" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage} className={buttonClass({ style: 'outline', color: 'gray' })}>
                {log.isFetchingNextPage ? 'Loading…' : 'Load older events'}
              </button>
            ) : (
              <p className="text-xs text-[#7c7c7c]">That is everything for this period.</p>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
