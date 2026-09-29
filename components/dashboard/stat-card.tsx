import Link from 'next/link';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, EllipsisHorizontalIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

import { changeOf } from '@/components/dashboard/change-badge';
import { Tooltip } from '@/components/ui/tooltip';
import type { Compare } from '@/lib/dashboard/types';
import type { HeroIcon } from '@/lib/nav';
import { percentChange } from '@/lib/format';

/**
 * One headline figure: icon, name, value and its change against the previous period. The ⋯
 * button opens the page behind the figure.
 */
export function StatCard({
  label,
  icon: Icon,
  compare,
  format,
  href,
  hrefLabel,
  hint,
}: {
  label: string;
  icon: HeroIcon;
  compare: Compare;
  format: (value: number) => string;
  href: string;
  hrefLabel: string;
  /** What exactly is counted, in a few words; shown from an info icon beside the name. */
  hint?: string;
}) {
  const change = changeOf(compare.current, compare.previous);
  const up = change === null || change >= 0;
  const Trend = up ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
  return (
    <section aria-label={label} className="flex h-37.5 min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface px-5 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center text-ink">
          <Icon className="size-8" />
        </span>
        <Link href={href} aria-label={hrefLabel} title={hrefLabel} className="flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-surface-soft">
          <EllipsisHorizontalIcon className="size-6" />
        </Link>
      </div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
        {label}
        {hint && (
          <Tooltip label={hint}>
            <button type="button" aria-label={`About ${label}`} className="flex size-5 items-center justify-center rounded-full text-[#7c7c7c] hover:text-ink">
              <InformationCircleIcon className="size-4" />
            </button>
          </Tooltip>
        )}
        {change === null && (
          <span title={`Nothing to compare with in ${compare.previousLabel} yet`} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary-soft px-2 text-xs font-normal leading-[18px] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            new
          </span>
        )}
      </p>
      <p className="truncate text-3xl font-medium text-ink">{format(compare.current)}</p>
      {change !== null && (
        <p
          className={`flex items-center gap-1 text-sm ${up ? 'text-success' : 'text-danger'}`}
          title={`vs ${compare.previousLabel}`}
          aria-label={`${up ? 'Up' : 'Down'} ${percentChange(change)} on ${compare.previousLabel}`}
        >
          <Trend className="size-5" />
          {up ? '+' : '-'}
          {percentChange(change)}
        </p>
      )}
    </section>
  );
}
