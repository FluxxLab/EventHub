import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

import { percentChange } from '@/lib/format';
import { cn } from '@/lib/utils';

/** "▲ 12.4%" in green, "▼ 3.4%" in red, "new" when there is nothing to compare against. */
export function ChangeBadge({ change, className }: { change: number | null; className?: string }) {
  if (change === null) {
    return <span className={cn('rounded-full bg-secondary-soft px-2 py-0.5 text-xs font-medium text-gold', className)}>new</span>;
  }
  const up = change >= 0;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-success' : 'text-danger', className)}
      aria-label={`${up ? 'up' : 'down'} ${percentChange(change)}`}
    >
      {up ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {percentChange(change)}
    </span>
  );
}

/** Percentage change from `previous` to `current`, one decimal; null when previous is zero. */
export function changeOf(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
