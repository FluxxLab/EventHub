import Link from 'next/link';

import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import type { DashboardView } from '@/lib/dashboard/types';
import { ago, money } from '@/lib/format';

/** The newest paid orders as a table: buyer, tickets, total and when. */
export function OrdersCard({ orders }: { orders: DashboardView['recentOrders'] }) {
  return (
    <Panel
      title="Recent orders"
      actions={
        <Link href="/ticketing" className="text-sm text-hint hover:text-primary">
          All orders
        </Link>
      }
      className="flex flex-col"
      bodyClassName="flex flex-1 flex-col px-6 py-5"
    >
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Paid orders show here as they come in." className="py-8" />
      ) : (
        <div className="relative -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[28rem] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-hint">
                <th className="py-2 font-normal">Buyer</th>
                <th className="py-2 text-right font-normal">Tickets</th>
                <th className="py-2 text-right font-normal">Total</th>
                <th className="py-2 text-right font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="max-w-0 truncate py-3 text-ink">{order.buyer}</td>
                  <td className="py-3 text-right tabular-nums text-ink">{order.tickets}</td>
                  <td className="py-3 text-right tabular-nums text-ink">{money(order.total, order.currency)}</td>
                  <td className="whitespace-nowrap py-3 text-right text-hint">{ago(order.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
