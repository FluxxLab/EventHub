'use client';

import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import type { usePageEdition } from '@/lib/events/use-page-edition';
import { dateRange } from '@/lib/events/events';

/**
 * Which event a page works on, above the page: a picker when there is a choice, the event's name
 * when there is one. `children` renders once an event is known, keyed so its state starts fresh
 * for each event.
 */
export function EventBar({ page, note, children }: { page: ReturnType<typeof usePageEdition>; note?: string; children: (editionId: string) => ReactNode }) {
  const { editions, edition, options, setEditionId } = page;
  if (editions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (editions.isError) {
    return (
      <p role="alert" className="mx-auto w-full max-w-6xl rounded-2xl border border-border bg-surface p-6 text-sm text-danger">
        {editions.error.message}
      </p>
    );
  }
  if (!edition) {
    return <p className="mx-auto w-full max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center text-sm text-[#7c7c7c]">No events yet. They appear here once one is created or assigned to you.</p>;
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDaysIcon className="size-5 text-[#7c7c7c]" aria-hidden />
        {options.length > 1 ? (
          <div className="w-64">
            <Select label="Event" value={edition.id} options={options} onChange={setEditionId} />
          </div>
        ) : (
          <p className="text-sm text-ink">{edition.shortName}</p>
        )}
        <p className="text-sm text-[#7c7c7c]">
          {edition.name} · {dateRange(edition.startsAt, edition.endsAt)}
          {note ? ` · ${note}` : ''}
        </p>
      </div>
      <div key={edition.id}>{children(edition.id)}</div>
    </div>
  );
}
