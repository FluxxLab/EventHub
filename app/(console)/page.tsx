'use client';

import Link from 'next/link';
import { BanknotesIcon, ShoppingBagIcon, TicketIcon, UsersIcon } from '@heroicons/react/24/outline';

import { buttonClass } from '@/components/ui/button';
import { ActivityCard, NewDelegatesCard } from '@/components/dashboard/activity-card';
import { GeoCard } from '@/components/dashboard/geo-card';
import { OrdersCard } from '@/components/dashboard/orders-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { TiersCard } from '@/components/dashboard/tiers-card';
import { TrendsCard } from '@/components/dashboard/trends-card';
import { Skeleton } from '@/components/ui/card';
import { runsEvents, useSession } from '@/lib/auth/session';
import { useDashboard } from '@/lib/dashboard/use-dashboard';
import { useEditions } from '@/lib/events/use-editions';
import { compact, count, money, moneyCompact } from '@/lib/format';

export default function DashboardPage() {
  const state = useSession();
  const isAdmin = state.status === 'signed-in' && runsEvents(state.user.tier);
  // an event organiser's dashboard is their event: the current one if they run it, else their first
  const scoped = state.status === 'signed-in' && state.user.tier === 'event_admin';
  const editions = useEditions();
  const theirs = scoped ? (editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0]) : undefined;
  const dashboard = useDashboard(theirs?.id, isAdmin && (!scoped || Boolean(theirs)));

  if (!isAdmin) {
    // Session operators land here after sign-in; the dashboard is organiser-only.
    return (
      <div className="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-medium text-ink">Welcome</h1>
        <p className="mt-1 text-sm text-muted">Your account runs live sessions. Open Live ops to start.</p>
        <Link href="/live" className={buttonClass({ className: 'mt-5' })}>
          Open Live ops
        </Link>
      </div>
    );
  }

  const data = dashboard.data;
  if (dashboard.isError && !data) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="font-medium text-ink">The dashboard could not load.</p>
        <p className="mt-1 text-sm text-muted">{dashboard.error.message}</p>
        <button
          type="button"
          onClick={() => void dashboard.refetch()}
          className={buttonClass({ className: 'mt-4' })}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Dashboard{data.edition ? `: ${data.edition.name}` : ''}</h1>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <StatCard label="Tickets sold" hint="Paid tickets to this event, this month" icon={TicketIcon} compare={data.kpis.ticketsSold} format={compact} href="/ticketing" hrefLabel="Open ticketing" />
        <StatCard
          label="Revenue"
          hint="Paid orders for this event, this month"
          icon={BanknotesIcon}
          compare={data.kpis.revenue}
          format={(v) => moneyCompact(v, data.currency)}
          href="/ticketing"
          hrefLabel="Open orders"
        />
        <StatCard
          label="Average order"
          hint="Revenue per paid order, this month"
          icon={ShoppingBagIcon}
          compare={data.kpis.averageOrder}
          format={(v) => money(v, data.currency)}
          href="/analytics"
          hrefLabel="Open analytics"
        />
        <StatCard
          label="New ticket holders"
          hint="First ticket to this event this month; not sign-ups"
          icon={UsersIcon}
          compare={data.kpis.delegates}
          format={count}
          href="/delegates"
          hrefLabel="Open delegates"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18.75rem] xl:gap-10">
        <TrendsCard data={data} />
        <TiersCard tiers={data.tables.tiers} status={data.orderStatus} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <OrdersCard orders={data.recentOrders} />
        <ActivityCard activity={data.activity} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GeoCard geography={data.geography} />
        <NewDelegatesCard people={data.recentDelegates} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-37.5" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_18.75rem] xl:gap-10">
        <Skeleton className="h-[434px]" />
        <Skeleton className="h-[434px]" />
      </div>
    </div>
  );
}
