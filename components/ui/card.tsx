import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** The bordered panel every dashboard widget sits in: a titled header strip over its body. */
export function Card({ title, action, className, children }: { title?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col rounded-lg border border-border bg-surface', className)} aria-label={title}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4">
          {title && <h2 className="text-xl font-medium text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="flex flex-1 flex-col px-5 py-4">{children}</div>
    </section>
  );
}

/** A grey block standing in for content while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-soft', className)} aria-hidden />;
}
