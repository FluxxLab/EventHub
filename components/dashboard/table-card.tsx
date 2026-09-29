import { ChangeBadge } from '@/components/dashboard/change-badge';
import { Card } from '@/components/ui/card';
import type { TableRow } from '@/lib/dashboard/types';
import { count } from '@/lib/format';

/** A ranked list with this period's value and its change, as in the design's three tables. */
export function TableCard({ title, valueLabel, rows }: { title: string; valueLabel: string; rows: TableRow[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 text-right font-medium">{valueLabel}</th>
              <th className="w-20 pb-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-divider">
                <td className="max-w-0 truncate py-2.5 font-medium text-ink">{row.label}</td>
                <td className="py-2.5 text-right tabular-nums text-ink">{count(row.value)}</td>
                <td className="py-2.5 text-right">
                  <ChangeBadge change={row.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
