import Link from 'next/link';

import { Card } from '@/components/ui/card';
import type { DashboardView } from '@/lib/dashboard/types';
import { ago, money } from '@/lib/format';

/** The newest paid orders as a table: buyer, tickets, total and when. */
export function OrdersCard({ orders }: { orders: DashboardView['recentOrders'] }) {
  return (
    <Card
      title="Recent orders"
      action={
        <Link href="/ticketing" className="text-xs text-ink/40 hover:text-primary">
          All orders
        </Link>
      }
    >
      {orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No orders yet.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[28rem] text-xs">
            <thead>
              <tr className="border-b border-ink/20 text-left text-ink/40">
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
                  <td className="whitespace-nowrap py-3 text-right text-ink/40">{ago(order.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
