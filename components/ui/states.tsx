import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The console's states for a panel or page with nothing to show yet. Every one offers a way on:
 * an action for empty, a retry for errors. Use inside a Panel, or on their own with `framed`.
 */

/** Nothing here yet: what would be here, and how to add the first one. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  framed = false,
  className,
}: {
  icon?: HeroIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  framed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-14 text-center', framed && 'card-art rounded-xl border border-border bg-surface', className)}>
      {Icon && (
        <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-surface-soft text-hint">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <p className="text-base font-medium text-ink">{title}</p>
      {body && <p className="max-w-md text-sm text-hint">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** It did not load: what failed, why if known, and Try again. */
export function ErrorState({
  title,
  error,
  onRetry,
  framed = false,
  className,
}: {
  title: string;
  error?: { message?: string } | string | null;
  onRetry?: () => void;
  framed?: boolean;
  className?: string;
}) {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-2 px-6 py-14 text-center', framed && 'card-art rounded-xl border border-border bg-surface', className)}>
      <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <ExclamationTriangleIcon className="size-5" aria-hidden />
      </span>
      <p className="text-base font-medium text-ink">{title}</p>
      {message && <p className="max-w-md text-sm text-hint">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass({ style: 'outline', color: 'gray', className: 'mt-3' })}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading: placeholder rows shaped like a table's, so nothing jumps when the data arrives. */
export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn('flex flex-col divide-y divide-border', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}
