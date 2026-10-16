'use client';

import { ArrowDownIcon, ArrowDownTrayIcon, ArrowUpIcon, ArrowsUpDownIcon, CalendarDaysIcon, PlusIcon, SwatchIcon, TagIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { CreateEventDialog } from '@/components/events/create-event-dialog';
import { EventBrandingDialog } from '@/components/events/event-branding';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { EventTopicsDialog } from '@/components/events/event-topics';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { categoryLabel, dateRange, editionsCsv, placeOf, sortEditions, STATUS_LABEL, type Edition, type EditionStatus, type Sort, type SortKey } from '@/lib/events/events';
import { useSession } from '@/lib/auth/session';
import { useEditions, useDeleteEdition } from '@/lib/events/use-editions';
import { cn } from '@/lib/utils';

/** Status as a tag tone: drafts and ended events recede, announced is brand, live is green. */
const STATUS_TONE: Record<EditionStatus, TagTone> = { draft: 'gray', announced: 'primary', live: 'green', ended: 'gray' };

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
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

/** Up to three letters of the short name ("GS-2027" → "GS"), so the mark never clips. */
const markOf = (shortName: string) => (shortName.replace(/[^A-Za-z]/g, '') || shortName.replace(/\s/g, '')).slice(0, 3).toUpperCase();

/** The event's cover, or its short name on navy; a green dot marks the edition the app shows. */
function EventMark({ edition }: { edition: Edition }) {
  const cover = edition.coverUrl ?? (edition.coverImage && /^https?:\/\//.test(edition.coverImage) ? edition.coverImage : null);
  return (
    <span className="relative inline-flex size-8 shrink-0">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from any host the organiser uploads to
        <img src={cover} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[0.625rem] font-medium leading-none text-on-primary" aria-hidden>
          {markOf(edition.shortName)}
        </span>
      )}
      {edition.isCurrent && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-[1.5px] border-surface bg-success" aria-hidden />}
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
  const toast = useToast();
  const rows = useMemo(() => sortEditions(editions.data ?? [], sort), [editions.data, sort]);

  // A new column sorts its natural way first (names A–Z, dates newest first); a second click flips it.
  const onSort = (key: SortKey) => setSort((was) => (was.key === key ? { key, dir: was.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'startsAt' ? 'desc' : 'asc' }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Events</h1>

      <Panel
        title="All events"
        count={editions.data?.length}
        actions={
          <>
            {canCreate && (
              <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                <PlusIcon className="size-4" />
                Add event
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                downloadCsv(rows);
                toast.push({
                  title: 'Export ready',
                  leading: { kind: 'icon', icon: ArrowDownTrayIcon },
                  body: `${rows.length} ${rows.length === 1 ? 'event' : 'events'} saved to your downloads as a CSV file.`,
                });
              }}
              disabled={rows.length === 0}
              className={buttonClass({ style: 'soft', color: 'gray' })}
            >
              <ArrowDownTrayIcon className="size-4" />
              Export CSV
            </button>
          </>
        }
      >
        {editions.isError && !editions.data ? (
          <ErrorState title="Events could not load" error={editions.error} onRetry={() => void editions.refetch()} />
        ) : editions.isPending ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            title="No events yet"
            body={canCreate ? 'Add an event to set up its programme, tickets and venue.' : 'No events have been assigned to you yet. Ask an organiser.'}
            action={
              canCreate && (
                <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                  <PlusIcon className="size-4" />
                  Add event
                </button>
              )
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr>
                  <SortHeader label="Event" sortKey="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Dates & venue" sortKey="startsAt" sort={sort} onSort={onSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                  <th scope="col" className={cn(th, 'w-24')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((edition) => (
                  // Zebra rows, as in the design: every second row on #F6F6F6.
                  <tr key={edition.id} className="even:bg-surface-soft last:[&>td]:border-b-0">
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <EventMark edition={edition} />
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-sm text-ink-soft">{edition.name}</p>
                          <p className="truncate text-xs text-placeholder">
                            {edition.shortName} · {categoryLabel(edition.category)}
                            {edition.isCurrent && ' · Live in the app'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>
                      <p className="whitespace-nowrap text-sm text-ink-soft">{dateRange(edition.startsAt, edition.endsAt)}</p>
                      <p className="max-w-64 truncate text-xs text-placeholder">{placeOf(edition) || 'Venue not set'}</p>
                    </td>
                    <td className={td}>
                      <div className="flex flex-col items-start gap-1">
                        <Tag tone={STATUS_TONE[edition.status]} dot>
                          {STATUS_LABEL[edition.status]}
                        </Tag>
                        <span className="text-xs text-placeholder">Registration {edition.registrationOpen ? 'open' : 'closed'}</span>
                      </div>
                    </td>
                    <td className={cn(td, 'text-right')}>
                      <RowActions
                        name={edition.name}
                        actions={[
                          { label: 'Tracks & interests', icon: TagIcon, onSelect: () => setTopicsFor(edition) },
                          ...(canCreate ? [{ label: 'Branding', icon: SwatchIcon, onSelect: () => setBrandingFor(edition) }] : []),
                        ]}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
