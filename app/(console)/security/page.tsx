'use client';

import { ArrowDownTrayIcon, ChevronDownIcon, ExclamationTriangleIcon, InformationCircleIcon, ShieldCheckIcon, ShieldExclamationIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useSession } from '@/lib/auth/session';
import { ago } from '@/lib/format';
import { detailsOf, eventsCsv, GROUPS, PERIOD_LABEL, periodFrom, SEVERITY_LABEL, tierLabel, typeLabel, type Group, type Period, type SecurityEvent, type Severity } from '@/lib/security/security';
import { useSecurityEvents } from '@/lib/security/use-security';
import { useNow } from '@/lib/use-now';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const SEVERITY_ICON = {
  critical: { icon: ShieldExclamationIcon, className: 'bg-danger-soft text-danger' },
  warning: { icon: ExclamationTriangleIcon, className: 'bg-warning-soft text-warning' },
  info: { icon: InformationCircleIcon, className: 'bg-surface-soft text-hint' },
} as const;

const GROUP_KEYS = Object.keys(GROUPS) as Group[];
const SEVERITIES = ['critical', 'warning', 'info'] as Severity[];
const PERIODS = Object.keys(PERIOD_LABEL) as Period[];
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
    return <span className="text-sm text-hint">{event.actionId ? 'Deleted account' : 'No one signed in'}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[0.6875rem] font-medium text-primary" aria-hidden>
        {initials(event.actor.name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm text-ink">{event.actor.name}</span>
        <span className="block truncate text-xs text-hint">{tierLabel(event.actor.tier)}</span>
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
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-3.5 text-left hover:bg-surface-soft md:grid-cols-[auto_minmax(0,1fr)_13rem_7rem_auto]"
      >
        <span className={cn('flex size-8 items-center justify-center rounded-full', severity.className)} title={SEVERITY_LABEL[event.severity]}>
          <severity.icon className="size-4" />
          <span className="sr-only">{SEVERITY_LABEL[event.severity]}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{typeLabel(event.type)}</span>
          {/* many audited actions describe themselves with their own name; say it once */}
          {event.description.toLowerCase() !== typeLabel(event.type).toLowerCase() && <span className="block truncate text-sm text-hint">{event.description}</span>}
        </span>
        <span className="hidden md:block">
          <Who event={event} />
        </span>
        <time dateTime={event.createdAt} title={exact(event.createdAt)} className="hidden whitespace-nowrap text-sm text-ink-soft md:block">
          {ago(event.createdAt, now)}
        </time>
        <ChevronDownIcon className={cn('size-4 text-hint transition-transform', open && 'rotate-180')} />
        {/* on a phone, who and when go under the event */}
        <span className="col-span-3 col-start-2 flex items-center justify-between gap-3 md:hidden">
          <Who event={event} />
          <time dateTime={event.createdAt} className="whitespace-nowrap text-xs text-hint">
            {ago(event.createdAt, now)}
          </time>
        </span>
      </button>
      {open && (
        <div className="grid gap-4 bg-surface-soft px-6 py-4 md:pl-[4.5rem]">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-hint">When</dt>
            <dd className="text-ink">{exact(event.createdAt)}</dd>
            {event.actor && (
              <>
                <dt className="text-hint">Who</dt>
                <dd className="text-ink">
                  {event.actor.name} · {event.actor.email} · {tierLabel(event.actor.tier)}
                </dd>
              </>
            )}
            {details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-hint">{d.label}</dt>
                <dd className="break-words text-ink">{d.value}</dd>
              </div>
            ))}
            <dt className="text-hint">Event ID</dt>
            <dd className="break-all font-mono text-xs text-ink-soft">{event.id}</dd>
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
  const [kind, setKind] = useUrlParam<Group | 'all'>('kind', 'all', ['all', ...GROUP_KEYS]);
  const [severity, setSeverity] = useUrlParam<Severity | 'all'>('severity', 'all', ['all', ...SEVERITIES]);
  const [period, setPeriod] = useUrlParam<Period>('period', '7', PERIODS);
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

  if (!isAdmin) return <EmptyState framed icon={ShieldCheckIcon} title="The security log is for organisers" className="mx-auto w-full max-w-lg" />;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="sr-only">Security log</h1>
      <Panel
        title="Security log"
        description="Sign-ins, reports and every organiser change, newest first. Read-only."
        actions={
          <button type="button" onClick={exportCsv} disabled={events.length === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" /> Export CSV
          </button>
        }
        toolbar={
          <>
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
                <button
                  type="button"
                  onClick={() => setPerson(null)}
                  aria-label={`Show everyone, not only ${person.name}`}
                  className="flex size-6 items-center justify-center rounded-full hover:bg-primary/10"
                >
                  <XMarkIcon className="size-4" />
                </button>
              </span>
            )}
            {log.data && (
              <p className="text-xs text-hint sm:ml-auto" aria-live="polite">
                {events.length}
                {log.hasNextPage ? '+' : ''} {events.length === 1 ? 'event' : 'events'}
                {critical > 0 && <span className="text-danger"> · {critical} critical</span>}
                {warnings > 0 && (
                  <span className="text-warning">
                    {' '}
                    · {warnings} {warnings === 1 ? 'warning' : 'warnings'}
                  </span>
                )}
              </p>
            )}
          </>
        }
        footer={
          log.data &&
          events.length > 0 && (
            <div className="flex w-full justify-center">
              {log.hasNextPage ? (
                <button type="button" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  {log.isFetchingNextPage ? 'Loading…' : 'Load older events'}
                </button>
              ) : (
                <p className="text-xs text-hint">That is everything for this period.</p>
              )}
            </div>
          )
        }
      >
        {/* column heads, desktop only */}
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_13rem_7rem_1rem] gap-x-4 border-b border-border px-6 py-2 text-xs text-hint md:grid">
          <span />
          <span>Event</span>
          <span>Who</span>
          <span>When</span>
          <span />
        </div>

        {log.isError && !log.data ? (
          <ErrorState title="The log could not load" error={log.error} onRetry={() => void log.refetch()} />
        ) : !log.data ? (
          <LoadingRows />
        ) : events.length === 0 ? (
          <EmptyState
            icon={ShieldCheckIcon}
            title={filtered ? 'Nothing matches these filters' : `Nothing recorded ${period === 'any' ? 'yet' : PERIOD_LABEL[period].toLowerCase()}`}
            body={filtered && period !== 'any' ? 'Or try a longer period.' : undefined}
            action={
              filtered ? (
                <button
                  type="button"
                  onClick={() => {
                    setKind('all');
                    setSeverity('all');
                    setPerson(null);
                  }}
                  className={buttonClass({ style: 'outline', color: 'gray' })}
                >
                  Clear filters
                </button>
              ) : period !== 'any' ? (
                <button type="button" onClick={() => setPeriod('any')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  Show all time
                </button>
              ) : undefined
            }
          />
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
      </Panel>
    </div>
  );
}
