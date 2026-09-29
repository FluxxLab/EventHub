'use client';

import { ArrowDownIcon, ArrowDownTrayIcon, ArrowUpIcon, ArrowsUpDownIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { CreateEventDialog } from '@/components/events/create-event-dialog';
import { EventBrandingDialog } from '@/components/events/event-branding';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { EventTopicsDialog } from '@/components/events/event-topics';
import { Skeleton } from '@/components/ui/card';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import {
  categoryLabel,
  dateRange,
  editionsCsv,
  placeOf,
  sortEditions,
  STATUS_LABEL,
  type Edition,
  type EditionStatus,
  type Sort,
  type SortKey,
} from '@/lib/events/events';
import { useSession } from '@/lib/auth/session';
import { activeValues, topicsSummary } from '@/lib/catalog/topics';
import { useInterestLibrary, useTrackLibrary } from '@/lib/catalog/use-topics';
import { useEditions, useDeleteEdition } from '@/lib/events/use-editions';
import { cn } from '@/lib/utils';

/** Status as a tag tone: drafts and ended events recede, announced is brand, live is green. */
const STATUS_TONE: Record<EditionStatus, TagTone> = { draft: 'gray', announced: 'primary', live: 'green', ended: 'gray' };

const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'h-15 border-b border-border px-4 text-sm text-ink';

/** Downloads the rows as they are sorted on screen. */
function downloadCsv(editions: Edition[]) {
  const blob = new Blob([editionsCsv(editions)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pic-events-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** The event's cover, or its short name on navy; a green dot marks the edition the app shows. */
function EventMark({ edition }: { edition: Edition }) {
  const cover = edition.coverUrl ?? (edition.coverImage && /^https?:\/\//.test(edition.coverImage) ? edition.coverImage : null);
  return (
    <span className="relative inline-flex size-8 shrink-0">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from any host the organiser uploads to
        <img src={cover} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-on-primary">
          {edition.shortName.slice(0, 4)}
        </span>
      )}
      {edition.isCurrent && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-[1.5px] border-surface bg-success" aria-hidden />
      )}
    </span>
  );
}

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: Sort; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowsUpDownIcon : sort.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th scope="col" className={th} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        <Icon className={cn('size-4', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

export default function EventsPage() {
  const editions = useEditions();
  // event organisers run the events they are given; creating events is the organisers'
  const auth = useSession();
  const canCreate = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const [sort, setSort] = useState<Sort>({ key: 'startsAt', dir: 'desc' });
  const [adding, setAdding] = useState(false);
  const [topicsFor, setTopicsFor] = useState<Edition | null>(null);
  const [brandingFor, setBrandingFor] = useState<Edition | null>(null);
  const [editing, setEditing] = useState<Edition | null>(null);
  const [deleting, setDeleting] = useState<Edition | null>(null);
  const remove = useDeleteEdition();
  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.push({ title: 'Event deleted', leading: { kind: 'icon', icon: TrashIcon }, body: `${deleting.name} is gone from the console.` });
        setDeleting(null);
      },
    });
  };
  const tracks = useTrackLibrary();
  const interests = useInterestLibrary();
  const toast = useToast();
  const rows = useMemo(() => sortEditions(editions.data ?? [], sort), [editions.data, sort]);

  // A new column sorts its natural way first (names A–Z, dates newest first); a second click flips it.
  const onSort = (key: SortKey) =>
    setSort((was) => (was.key === key ? { key, dir: was.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'startsAt' ? 'desc' : 'asc' }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Events</h1>

      {/* One card: the header strip (title and actions) over the table. */}
      <section
        aria-labelledby="events-title"
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <h2 id="events-title" className="flex items-center gap-2 text-xl font-medium text-ink">
            All events
            {editions.data && <Tag tone="gray">{editions.data.length}</Tag>}
          </h2>
          <div className="flex items-center gap-4">
            {canCreate && (
              <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                <PlusIcon className="size-4" />
                Add event
              </button>
            )}
            <button type="button" onClick={() => {
                downloadCsv(rows);
                toast.push({
                  title: 'Export ready',
                  leading: { kind: 'icon', icon: ArrowDownTrayIcon },
                  body: `${rows.length} ${rows.length === 1 ? 'event' : 'events'} saved to your downloads as a CSV file.`,
                });
              }} disabled={rows.length === 0} className={buttonClass({ style: 'soft', color: 'gray' })}>
              <ArrowDownTrayIcon className="size-4" />
              Export CSV
            </button>
          </div>
        </header>

        {editions.isError && !editions.data ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">Events could not load.</p>
            <p className="mt-1 text-sm text-muted">{editions.error.message}</p>
            <button type="button" onClick={() => void editions.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] border-collapse">
              <thead>
                <tr>
                  <SortHeader label="Event" sortKey="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Dates" sortKey="startsAt" sort={sort} onSort={onSort} />
                  <th scope="col" className={th}>
                    Venue
                  </th>
                  <th scope="col" className={th}>
                    Category
                  </th>
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                  <th scope="col" className={th}>
                    Registration
                  </th>
                  <th scope="col" className={th}>
                    Tracks &amp; interests
                  </th>
                  <th scope="col" className={th}>
                    Branding
                  </th>
                  <th scope="col" className={cn(th, 'w-24')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody aria-busy={editions.isPending}>
                {editions.isPending ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} className="even:bg-[#f6f6f6]">
                      <td colSpan={9} className={td}>
                        <Skeleton className="h-6" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted">
                      {canCreate ? (
                        <>
                          No events yet.{' '}
                          <button type="button" onClick={() => setAdding(true)} className="font-medium text-primary hover:underline">
                            Add the first one
                          </button>
                        </>
                      ) : (
                        'No events have been assigned to you yet. Ask an organiser.'
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((edition) => (
                    // Zebra rows, as in the design: every second row on #F6F6F6.
                    <tr key={edition.id} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <EventMark edition={edition} />
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-sm text-[#525252]">{edition.name}</p>
                            <p className="truncate text-xs text-placeholder">
                              {edition.shortName}
                              {edition.isCurrent && ' · Live in the app'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap')}>{dateRange(edition.startsAt, edition.endsAt)}</td>
                      <td className={cn(td, 'max-w-56 truncate')}>{placeOf(edition) || <span className="text-placeholder">Not set</span>}</td>
                      <td className={td}>{categoryLabel(edition.category)}</td>
                      <td className={td}>
                        <Tag tone={STATUS_TONE[edition.status]} dot>
                          {STATUS_LABEL[edition.status]}
                        </Tag>
                      </td>
                      <td className={td}>
                        <Tag tone={edition.registrationOpen ? 'green' : 'gray'} dot>
                          {edition.registrationOpen ? 'Open' : 'Closed'}
                        </Tag>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => setTopicsFor(edition)}
                          aria-label={`Tracks and interests for ${edition.name}`}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded text-sm text-primary hover:underline"
                        >
                          {edition.trackValues || edition.interestValues
                            ? topicsSummary(edition.trackValues?.length ?? 0, edition.interestValues?.length ?? 0)
                            : tracks.data && interests.data
                              ? topicsSummary(activeValues(tracks.data).length, activeValues(interests.data).length)
                              : 'Choose'}
                          <PencilSquareIcon className="size-4" />
                        </button>
                      </td>
                      <td className={td}>
                        {canCreate ? (
                          <button
                            type="button"
                            onClick={() => setBrandingFor(edition)}
                            aria-label={`Branding for ${edition.name}`}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded text-sm text-primary hover:underline"
                          >
                            <span className="size-3.5 rounded-full border border-black/10" style={{ background: edition.brandColor ?? '#002d74' }} aria-hidden />
                            {edition.coverUrl || edition.logoUrl || edition.brandColor ? 'Edit' : 'Add'}
                            <PencilSquareIcon className="size-4" />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm text-[#525252]">
                            <span className="size-3.5 rounded-full border border-black/10" style={{ background: edition.brandColor ?? '#002d74' }} aria-hidden />
                            {edition.brandColor ? edition.brandColor.toUpperCase() : 'PIC navy'}
                          </span>
                        )}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <RowActions
                          name={edition.name}
                          onEdit={() => setEditing(edition)}
                          onDelete={
                            canCreate
                              ? () => {
                                  remove.reset();
                                  setDeleting(edition);
                                }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateEventDialog open={adding} onClose={() => setAdding(false)} />
      <EventTopicsDialog edition={topicsFor} onClose={() => setTopicsFor(null)} />
      <EventBrandingDialog edition={brandingFor} onClose={() => setBrandingFor(null)} />
      <CreateEventDialog open={editing !== null} edition={editing} onClose={() => setEditing(null)} />
      <DeleteDialog
        open={deleting !== null}
        title={`Delete ${deleting?.shortName ?? 'this event'}?`}
        pending={remove.isPending}
        refusal={remove.error?.message ?? null}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
      >
        Only an event with nothing in it yet can be deleted: no sessions, tickets, orders or polls. To retire an event that ran, set it to Ended.
      </DeleteDialog>
    </div>
  );
}
