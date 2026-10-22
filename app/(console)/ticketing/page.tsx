'use client';

import { BanknotesIcon, ChartBarIcon, PlusIcon, QrCodeIcon, ShoppingCartIcon, TicketIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { OrdersCard } from '@/components/dashboard/orders-card';
import { FigureCard } from '@/components/dashboard/stat-card';
import { EventBar } from '@/components/events/event-bar';
import { TierDialog } from '@/components/ticketing/tier-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Panel } from '@/components/ui/panel';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { tabId, tabPanelId, UnderlineTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { ScrollHints } from '@/components/ui/scroll-hints';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';
import { useDashboard } from '@/lib/dashboard/use-dashboard';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count, moneyCompact } from '@/lib/format';
import { EXTRA_CURRENCIES, formatMoney, priceModeOf, remaining, soldShare, type TicketType } from '@/lib/ticketing/ticketing';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

const TABS = ['tiers', 'sales'] as const;
type Tab = (typeof TABS)[number];

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
        {count(tier.sold)} <span className="text-hint">{tier.capacity ? `of ${count(tier.capacity)}` : 'sold, unlimited'}</span>
      </p>
      {share !== null && (
        <>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <span className={cn('block h-full rounded-full', share >= 1 ? 'bg-danger' : share >= 0.85 ? 'bg-warning' : 'bg-primary')} style={{ width: `${share * 100}%` }} />
          </span>
          <p className={cn('mt-1 text-xs', left === 0 ? 'text-danger' : 'text-hint')}>{left === 0 ? 'Sold out' : `${count(left!)} left`}</p>
        </>
      )}
    </div>
  );
}

function TiersPanel({ edition }: { edition: Edition }) {
  const tiers = useTicketTypes(edition.id);
  const [editing, setEditing] = useState<{ tier: TicketType | null } | null>(null);

  return (
    <Panel
      title="Ticket tiers"
      count={tiers.data?.tiers.length}
      description="What delegates can buy at checkout, in the order it lists them."
      actions={
        <button type="button" onClick={() => setEditing({ tier: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          Add tier
        </button>
      }
      footer={
        // Shown only while the API lacks the organiser route that lists off-sale tiers too.
        tiers.data?.onSaleOnly && tiers.data.tiers.length > 0 ? 'Only tiers on sale are listed. A tier taken off sale drops out of this list; its tickets stay valid.' : undefined
      }
    >
      {tiers.isError && !tiers.data ? (
        <ErrorState title="Ticket tiers could not load" error={tiers.error} onRetry={() => void tiers.refetch()} />
      ) : tiers.isPending ? (
        <LoadingRows rows={3} />
      ) : tiers.data!.tiers.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title="No ticket tiers yet"
          body={`Add a tier, such as Standard, VIP or Student, so delegates can get tickets for ${edition.shortName}.`}
          action={
            <button type="button" onClick={() => setEditing({ tier: null })} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Add tier
            </button>
          }
        />
      ) : (
        <div {...tableScroll} className={`relative overflow-x-auto ${tableScrollFocus}`}>
          <ScrollHints />
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
            <tbody>
              {tiers.data!.tiers.map((tier) => (
                <tr key={tier.id} className={cn('even:bg-surface-soft last:[&>td]:border-b-0', !tier.isActive && 'text-hint [&>td>*]:opacity-60')}>
                  <td className={td}>
                    <p className="flex items-center gap-2 text-ink-soft">
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
                      <p className="line-clamp-2 text-xs text-ink-soft" title={tier.perks.join('\n')}>
                        {tier.perks.join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <RowActions name={tier.name} onEdit={() => setEditing({ tier })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TierDialog open={!!editing} onClose={() => setEditing(null)} editionId={edition.id} tier={editing?.tier ?? null} />
    </Panel>
  );
}

/** Sales for the edition, from the dashboard's aggregates (the API has no order list yet). */
function SalesPanel({ edition }: { edition: Edition }) {
  const dashboard = useDashboard(edition.id);
  const data = dashboard.data;

  if (dashboard.isError && !data) {
    return <ErrorState framed title="Sales could not load" error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-37.5" />
        ))}
      </div>
    );
  }

  const { orderStatus: o } = data;
  const admittedShare = o.ticketsIssued ? o.admitted / o.ticketsIssued : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <FigureCard label="Tickets issued" icon={TicketIcon} value={count(o.ticketsIssued)} note={`${count(o.unclaimedHolders)} holders yet to sign in`} />
        <FigureCard label="Revenue" icon={BanknotesIcon} value={moneyCompact(data.kpis.revenue.current, data.currency)} note={data.kpis.revenue.currentLabel} />
        <FigureCard label="Paid orders" icon={ShoppingCartIcon} value={count(o.paid)} note={`${count(o.pending)} awaiting payment · ${count(o.cancelled)} cancelled`} />
        <FigureCard
          label="Checked in"
          icon={QrCodeIcon}
          value={
            <>
              {count(o.admitted)} <span className="text-sm font-normal text-hint">of {count(o.ticketsIssued)}</span>
            </>
          }
        >
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <span className="block h-full rounded-full bg-success" style={{ width: `${admittedShare * 100}%` }} />
          </span>
        </FigureCard>
      </div>
      <OrdersCard orders={data.recentOrders} />
      <p className="text-xs text-hint">The latest orders only: a full order list, refunds and re-sending tickets need API endpoints that do not exist yet.</p>
    </div>
  );
}

export default function TicketingPage() {
  const page = usePageEdition();
  return (
    <>
      <h1 className="sr-only">Ticketing</h1>
      <EventBar page={page}>{(editionId) => <TicketingBoard edition={page.list.find((e) => e.id === editionId)!} />}</EventBar>
    </>
  );
}

/** The working event's tiers and sales, a tab each. */
function TicketingBoard({ edition }: { edition: Edition }) {
  const [tab, setTab] = useUrlParam<Tab>('tab', 'tiers', TABS);
  const tiers = useTicketTypes(edition.id);
  return (
    <div className="flex flex-col gap-6">
      <UnderlineTabs
        label="Ticketing sections"
        idBase="ticketing"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tiers', label: 'Ticket tiers', icon: TicketIcon, count: tiers.data?.tiers.length },
          { value: 'sales', label: 'Sales', icon: ChartBarIcon },
        ]}
      />
      <div id={tabPanelId('ticketing', tab)} role="tabpanel" aria-labelledby={tabId('ticketing', tab)}>
        {tab === 'tiers' ? <TiersPanel edition={edition} /> : <SalesPanel edition={edition} />}
      </div>
    </div>
  );
}
