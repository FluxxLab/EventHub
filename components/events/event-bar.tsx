'use client';

import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import type { usePageEdition } from '@/lib/events/use-page-edition';
import { dateRange } from '@/lib/events/events';

/**
 * Which event a page works on, above the page: a picker when there is a choice, the event's name
 * when there is one. `children` renders once an event is known, keyed so its state starts fresh
 * for each event.
 */
export function EventBar({ page, note, children }: { page: ReturnType<typeof usePageEdition>; note?: string; children: (editionId: string) => ReactNode }) {
  const { editions, edition } = page;
  if (editions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-xl" />;
  if (editions.isError) {
    return <ErrorState framed title="Events could not load" error={editions.error} onRetry={() => void editions.refetch()} className="mx-auto w-full max-w-6xl" />;
  }
  if (!edition) {
    return <EmptyState framed icon={CalendarDaysIcon} title="No events yet" body="They appear here once one is created or assigned to you." className="mx-auto w-full max-w-6xl" />;
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      {/* the event is picked in the top bar, for every page; here it is only named */}
      <p className="flex items-center gap-2 text-sm text-hint">
        <CalendarDaysIcon className="size-4 shrink-0" aria-hidden />
        <span>
          <span className="text-ink-soft">{edition.name}</span> · {dateRange(edition.startsAt, edition.endsAt)}
          {note ? ` · ${note}` : ''}
        </span>
      </p>
      <div key={edition.id}>{children(edition.id)}</div>
    </div>
  );
}
