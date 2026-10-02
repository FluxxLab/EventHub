'use client';

import Link from 'next/link';
import { ChartBarIcon, PencilSquareIcon, PlusIcon, TicketIcon } from '@heroicons/react/24/outline';
import { useState, type KeyboardEvent, type ReactNode } from 'react';

import { OrdersCard } from '@/components/dashboard/orders-card';
import { TierDialog } from '@/components/ticketing/tier-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { useDashboard } from '@/lib/dashboard/use-dashboard';
import type { Edition } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import { count, moneyCompact } from '@/lib/format';
import { EXTRA_CURRENCIES, formatMoney, priceModeOf, remaining, soldShare, type TicketType } from '@/lib/ticketing/ticketing';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { cn } from '@/lib/utils';

const cardClass =
  'overflow-hidden rounded-2xl border border-border bg-surface shadow-lg';
const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

const TABS = [
  { key: 'tiers', label: 'Ticket tiers', icon: TicketIcon },
  { key: 'sales', label: 'Sales', icon: ChartBarIcon },
] as const;
type Tab = (typeof TABS)[number]['key'];

function Tabs({ tab, onChange, tierCount }: { tab: Tab; onChange: (tab: Tab) => void; tierCount: number | undefined }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = TABS[(TABS.findIndex((t) => t.key === tab) + 1) % TABS.length]!.key;
    onChange(next);
    document.getElementById(`ticketing-tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Ticketing sections" onKeyDown={onKey} className="flex gap-6 border-b border-border">
      {TABS.map((t) => {
        const selected = tab === t.key;
        return (
          <button
            key={t.key}
            id={`ticketing-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="ticketing-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors',
              selected ? 'border-primary font-medium text-primary' : 'border-transparent text-[#525252] hover:text-ink',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {t.key === 'tiers' && tierCount !== undefined && <Tag tone={selected ? 'primary' : 'gray'}>{tierCount}</Tag>}
          </button>
        );
      })}
    </div>
  );
}

/** The tier's price: naira first, then any other currencies, or its mode when it has no price. */
function PriceCell({ tier }: { tier: TicketType }) {
  const mode = priceModeOf(tier);
  if (mode === 'invitation') return <Tag tone="gold">By invitation</Tag>;
  if (mode === 'free') return <Tag tone="green">Free</Tag>;
  const others = EXTRA_CURRENCIES.filter((c) => tier.prices[c] != null);
  return (
    <div>
      <p className="tabular-nums text-ink">{formatMoney(tier.price!, 'NGN')}</p>
      {others.length > 0 && <p className="text-xs text-placeholder">{others.map((c) => formatMoney(tier.prices[c]!, c)).join(' · ')}</p>}
    </div>
  );
}

/** Sold against capacity, with a bar; "unlimited" when there is no cap. */
function SoldCell({ tier }: { tier: TicketType }) {
  const share = soldShare(tier);
  const left = remaining(tier);
  return (
    <div className="w-44">
      <p className="text-sm tabular-nums text-ink">
        {count(tier.sold)} <span className="text-[#7c7c7c]">{tier.capacity ? `of ${count(tier.capacity)}` : 'sold, unlimited'}</span>
      </p>
      {share !== null && (
        <>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#ececec]" aria-hidden>
            <span className={cn('block h-full rounded-full', share >= 1 ? 'bg-danger' : share >= 0.85 ? 'bg-gold' : 'bg-primary')} style={{ width: `${share * 100}%` }} />
          </span>
          <p className={cn('mt-1 text-xs', left === 0 ? 'text-danger' : 'text-[#7c7c7c]')}>{left === 0 ? 'Sold out' : `${count(left!)} left`}</p>
        </>
      )}
    </div>
  );
}

function TiersPanel({ edition }: { edition: Edition }) {
  const tiers = useTicketTypes(edition.id);
  const [editing, setEditing] = useState<{ tier: TicketType | null } | null>(null);

  return (
    <section aria-labelledby="tiers-title" className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
        <div>
          <h2 id="tiers-title" className="text-xl font-medium text-ink">
            Ticket tiers
          </h2>
          <p className="mt-0.5 text-sm text-[#7c7c7c]">What delegates can buy at checkout, in the order it lists them.</p>
        </div>
        <button type="button" onClick={() => setEditing({ tier: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          Add tier
        </button>
      </header>

      {tiers.isError && !tiers.data ? (
        <div role="alert" className="p-10 text-center">
          <p className="font-medium text-ink">Ticket tiers could not load.</p>
          <p className="mt-1 text-sm text-muted">{tiers.error.message}</p>
          <button type="button" onClick={() => void tiers.refetch()} className={buttonClass({ className: 'mt-4' })}>
            Try again
          </button>
        </div>
      ) : !tiers.isPending && (tiers.data?.tiers ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <TicketIcon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">No ticket tiers yet</p>
            <p className="mt-1 max-w-sm text-sm text-[#7c7c7c]">Add a tier, such as Standard, VIP or Student, so delegates can get tickets for {edition.shortName}.</p>
          </div>
          <button type="button" onClick={() => setEditing({ tier: null })} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PlusIcon className="size-4" />
            Add the first tier
          </button>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Tier
                </th>
                <th scope="col" className={th}>
                  Price
                </th>
                <th scope="col" className={th}>
                  Sold
                </th>
                <th scope="col" className={th}>
                  Includes
                </th>
                <th scope="col" className={cn(th, 'w-16')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody aria-busy={tiers.isPending}>
              {tiers.isPending
                ? [0, 1, 2].map((i) => (
                    <tr key={i} className="even:bg-[#f6f6f6]">
                      <td colSpan={5} className={td}>
                        <Skeleton className="h-10" />
                      </td>
                    </tr>
                  ))
                : tiers.data!.tiers.map((tier) => (
                    <tr key={tier.id} className={cn('even:bg-[#f6f6f6] last:[&>td]:border-b-0', !tier.isActive && 'text-[#7c7c7c] [&>td>*]:opacity-60')}>
                      <td className={td}>
                        <p className="flex items-center gap-2 text-[#525252]">
                          {tier.name}
                          {!tier.isActive && <Tag>Off sale</Tag>}
                        </p>
                        <p className="text-xs text-placeholder">Section: {tier.section}</p>
                      </td>
                      <td className={td}>
                        <PriceCell tier={tier} />
                      </td>
                      <td className={td}>
                        <SoldCell tier={tier} />
                      </td>
                      <td className={cn(td, 'max-w-xs')}>
                        {tier.perks.length === 0 ? (
                          <span className="text-placeholder">Nothing listed</span>
                        ) : (
                          <p className="line-clamp-2 text-xs text-[#525252]" title={tier.perks.join('\n')}>
                            {tier.perks.join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <button
                          type="button"
                          onClick={() => setEditing({ tier })}
                          className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true })}
                          aria-label={`Edit ${tier.name}`}
                          title="Edit"
                        >
                          <PencilSquareIcon className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {tiers.data?.onSaleOnly && (
            // Shown only while the API lacks the organiser route that lists off-sale tiers too.
            <p className="border-t border-border bg-[#f6f6f6] px-6 py-3 text-xs text-[#7c7c7c]">
              Only tiers on sale are listed. A tier taken off sale drops out of this list; its tickets stay valid.
            </p>
          )}
        </div>
      )}

      <TierDialog open={!!editing} onClose={() => setEditing(null)} editionId={edition.id} tier={editing?.tier ?? null} />
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm text-[#525252]">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-[#7c7c7c]">{hint}</p>}
    </div>
  );
}

/** Sales for the edition, from the dashboard's aggregates (the API has no order list yet). */
function SalesPanel({ edition }: { edition: Edition }) {
  const dashboard = useDashboard(edition.id);
  const data = dashboard.data;

  if (dashboard.isError && !data) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">Sales could not load.</p>
        <p className="mt-1 text-sm text-muted">{dashboard.error.message}</p>
        <button type="button" onClick={() => void dashboard.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const { orderStatus: o } = data;
  const admittedShare = o.ticketsIssued ? o.admitted / o.ticketsIssued : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tickets issued" value={count(o.ticketsIssued)} hint={`${count(o.unclaimedHolders)} holders yet to sign in`} />
        <Stat label="Revenue" value={moneyCompact(data.kpis.revenue.current, data.currency)} hint={data.kpis.revenue.currentLabel} />
        <Stat label="Paid orders" value={count(o.paid)} hint={`${count(o.pending)} awaiting payment · ${count(o.cancelled)} cancelled`} />
        <div className="rounded-lg border border-border bg-surface px-5 py-4">
          <p className="text-sm text-[#525252]">Checked in</p>
          <p className="mt-1 text-2xl font-medium tabular-nums text-ink">
            {count(o.admitted)} <span className="text-sm font-normal text-[#7c7c7c]">of {count(o.ticketsIssued)}</span>
          </p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#ececec]" aria-hidden>
            <span className="block h-full rounded-full bg-success" style={{ width: `${admittedShare * 100}%` }} />
          </span>
        </div>
      </div>
      <OrdersCard orders={data.recentOrders} />
      <p className="text-xs text-[#7c7c7c]">
        These are the latest orders. A full order list, refunds and re-sending tickets need endpoints the API does not have yet.
      </p>
    </div>
  );
}

export default function TicketingPage() {
  const editions = useEditions();
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tiers');
  const edition = editions.data?.find((e) => e.id === picked) ?? editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const tiers = useTicketTypes(edition?.id);

  if (editions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (!edition) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-surface p-10 text-center">
        <h1 className="text-xl font-medium text-ink">No events yet</h1>
        <p className="mt-2 text-sm text-muted">Tickets belong to an event. Create the event first.</p>
        <Link href="/events" className={buttonClass({ className: 'mt-6' })}>
          Go to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-medium text-ink">{edition.name}</h1>
          <p className="mt-0.5 text-sm text-[#7c7c7c]">Ticket tiers and sales for this event.</p>
        </div>
        <div className="w-80 max-w-full">
          <Select
            label="Event"
            value={edition.id}
            options={(editions.data ?? []).map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))}
            onChange={setPicked}
          />
        </div>
      </header>
      <Tabs tab={tab} onChange={setTab} tierCount={tiers.data?.tiers.length} />
      <div id="ticketing-panel" role="tabpanel" aria-labelledby={`ticketing-tab-${tab}`}>
        {tab === 'tiers' ? <TiersPanel edition={edition} /> : <SalesPanel edition={edition} />}
      </div>
    </div>
  );
}
