'use client';

import { useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowUturnLeftIcon, CheckBadgeIcon, CheckCircleIcon, MagnifyingGlassIcon, UsersIcon } from '@heroicons/react/24/outline';
import { Suspense, useDeferredValue, useMemo, useState } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { ImportDialog } from '@/components/delegates/import-dialog';
import { buttonClass } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';
import {
  countByStatus,
  delegatesCsv,
  filterByStatus,
  isStaff,
  paginate,
  STATUS_LABEL,
  statusOf,
  type Delegate,
  type DelegateStatus,
  type DelegateTicket,
  type StatusFilter,
} from '@/lib/delegates/delegates';
import { useSession } from '@/lib/auth/session';
import { useDelegateActions, useDelegates } from '@/lib/delegates/use-delegates';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

const STATUS_TONE: Record<DelegateStatus, TagTone> = { pending: 'gold', approved: 'green', unclaimed: 'gray' };
const STATUS_VALUES: readonly StatusFilter[] = ['all', 'pending', 'approved', 'unclaimed'];
/** Every event's delegates, or only the working event's (picked in the top bar). */
type Scope = 'all' | 'working';
const SCOPES: readonly Scope[] = ['all', 'working'];
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'unclaimed', label: 'Ticket not claimed' },
];

const registered = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function downloadCsv(delegates: Delegate[]) {
  const blob = new Blob([delegatesCsv(delegates)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pic-delegates-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DelegatesView({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  // one of the chosen event's ticket tiers (from Ticketing), or every tier
  const [tier, setTier] = useState('all');
  const [status, setStatus] = useUrlParam<StatusFilter>('status', 'all', STATUS_VALUES);
  const [page, setPage] = useState(1);
  // Typing does not fire a request per keystroke: the search follows the text once React is idle.
  const search = useDeferredValue(query.trim());
  // Event organisers see the working event's ticket holders only (the event is picked in the top
  // bar); organisers can see everyone, or narrow to the working event.
  const auth = useSession();
  const scoped = auth.status === 'signed-in' && auth.user.tier === 'event_admin';
  const working = useWorkingEdition();
  const editions = working.editions;
  const [scope, setScope] = useUrlParam<Scope>('events', 'all', SCOPES);
  const oneEvent = (editions.data?.length ?? 0) === 1;
  const editionId = scoped || scope === 'working' || oneEvent ? working.edition?.id : undefined;
  const scopeOptions = [
    { value: 'all' as const, label: 'All events' },
    { value: 'working' as const, label: working.edition?.shortName ?? 'This event' },
  ];
  const delegates = useDelegates({ search, ticketTypeId: tier, editionId }, !scoped || Boolean(editionId));
  const ticketTypes = useTicketTypes(editionId);
  const eventTiers = useMemo(() => (editionId ? (ticketTypes.data?.tiers ?? []) : []), [editionId, ticketTypes.data]);
  const tierFilter = [{ value: 'all', label: 'All tiers' }, ...eventTiers.map((t) => ({ value: t.id, label: t.name }))];
  const shortNames = useMemo(() => new Map((editions.data ?? []).map((e) => [e.id, e.shortName])), [editions.data]);
  const canImport = Boolean(editions.data && editions.data.length > 0);
  const actions = useDelegateActions();
  const toast = useToast();

  // the delegate and their ticket to the chosen event, while its tier is being changed
  const [changing, setChanging] = useState<{ delegate: Delegate; ticket: DelegateTicket } | null>(null);
  const [newTier, setNewTier] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [importing, setImporting] = useState(false);

  // Attendees only: organisers and session operators have their own table on the Team page.
  const all = useMemo(() => (delegates.data ?? []).filter((d) => !isStaff(d)), [delegates.data]);
  const counts = useMemo(() => countByStatus(all), [all]);
  // a tier is named with its event only while the list holds more than one event's tickets
  const manyEvents = useMemo(() => !editionId && new Set(all.flatMap((d) => (d.tickets ?? []).map((t) => t.editionId))).size > 1, [all, editionId]);
  const filtered = useMemo(() => filterByStatus(all, status), [all, status]);
  const view = paginate(filtered, page);
  const capped = all.length >= 500;

  /** Their ticket to the chosen event; only that can move to another of its tiers. */
  const ticketHere = (d: Delegate) => (editionId ? d.tickets?.find((t) => t.editionId === editionId) : undefined);
  const openTier = (d: Delegate, ticket: DelegateTicket) => {
    actions.moveTicket.reset();
    setChanging({ delegate: d, ticket });
    setNewTier(ticket.ticketTypeId);
  };
  const confirmTier = () => {
    if (!changing) return;
    const to = eventTiers.find((t) => t.id === newTier);
    if (!to || to.id === changing.ticket.ticketTypeId) return setChanging(null);
    actions.moveTicket.mutate(
      { ticketId: changing.ticket.ticketId, ticketTypeId: to.id, tierName: to.name },
      {
        onSuccess: () => {
          toast.push({
            title: 'Tier changed',
            leading: { kind: 'avatar', name: changing.delegate.name },
            body: `${changing.delegate.name} now has a ${to.name} ticket. Their QR still works; reprint their badge to show the new tier.`,
          });
          setChanging(null);
        },
      },
    );
  };
  const approve = (d: Delegate, approved: boolean) =>
    actions.setApproval.mutate(
      { id: d.id, approved },
      {
        onSuccess: () =>
          toast.push({
            title: approved ? 'Delegate approved' : 'Sent back for review',
            leading: { kind: 'avatar', name: d.name },
            body: approved ? `${d.name} can now use the app.` : `${d.name} sees the waiting screen until approved.`,
          }),
      },
    );
  const clearFilters = () => {
    setQuery('');
    setTier('all');
    setStatus('all');
    setPage(1);
  };
  const confirmApproveAll = () =>
    actions.approveAll.mutate(undefined, {
      onSuccess: ({ approved }) => {
        setApprovingAll(false);
        toast.push({
          title: 'Delegates approved',
          leading: { kind: 'icon', icon: CheckBadgeIcon, tone: 'success' },
          body: `${approved} ${approved === 1 ? 'delegate' : 'delegates'} can now use the app.`,
        });
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Delegates</h1>
      {editions.data && canImport && (
        <ImportDialog key={importing ? 'open' : 'closed'} open={importing} editions={editions.data} initialEditionId={editionId ?? working.edition?.id} onClose={() => setImporting(false)} />
      )}

      <Panel
        title={
          <>
            Delegates
            {delegates.data && capped && <Tag>500+</Tag>}
          </>
        }
        count={delegates.data && !capped ? all.length : undefined}
        description="Everyone registered, their tickets and whether they are approved."
        actions={
          <>
            {!scoped && counts.pending > 0 && (
              <button type="button" onClick={() => setApprovingAll(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
                <CheckBadgeIcon className="size-4" />
                Approve all pending ({counts.pending})
              </button>
            )}
            {canImport && (
              <button type="button" onClick={() => setImporting(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
                <ArrowUpTrayIcon className="size-4" />
                Import attendees
              </button>
            )}
            <button type="button" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0} className={buttonClass({ style: 'soft', color: 'gray' })}>
              <ArrowDownTrayIcon className="size-4" />
              Export CSV
            </button>
          </>
        }
        toolbar={
          <>
            <SegmentedTabs
              label="Status"
              options={STATUS_TABS.map((t) => ({ ...t, count: t.value === 'all' ? all.length : counts[t.value] }))}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
            {/* full width on a phone, so the status tabs keep a row of their own */}
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <TextInput
                icon={MagnifyingGlassIcon}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, email or organisation"
                aria-label="Search delegates"
                className="w-full sm:w-72"
              />
              {!scoped && !oneEvent && working.edition && (
                <div className="w-full sm:w-40">
                  <Select
                    label="Events shown"
                    value={scope}
                    options={scopeOptions}
                    onChange={(v) => {
                      setScope(v);
                      // tiers are the event's own
                      setTier('all');
                      setPage(1);
                    }}
                  />
                </div>
              )}
              {editionId && eventTiers.length > 0 && (
                <div className="w-full sm:w-44">
                  <Select
                    label="Tier"
                    value={tier}
                    options={tierFilter}
                    onChange={(v) => {
                      setTier(v);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        }
        footer={
          // Paging, done here: the API returns the whole (capped) list at once.
          filtered.length > 0 && (
            <>
              <p>
                {(view.page - 1) * 25 + 1}–{Math.min(view.page * 25, filtered.length)} of {filtered.length}
                {capped && <span className="ml-2 text-xs text-hint">(the newest 500; search to narrow)</span>}
              </p>
              <Pagination page={view.page} pages={view.pages} onChange={setPage} label="Delegate pages" className="p-0 sm:p-0" />
            </>
          )
        }
      >
        {delegates.isError && !delegates.data ? (
          <ErrorState title="Delegates could not load." error={delegates.error} onRetry={() => void delegates.refetch()} />
        ) : delegates.isPending ? (
          <LoadingRows />
        ) : view.rows.length === 0 ? (
          all.length === 0 && !search && tier === 'all' ? (
            <EmptyState
              icon={UsersIcon}
              title="No delegates have registered yet"
              body="They appear here as they register, or import a list you already have."
              action={
                canImport && (
                  <button type="button" onClick={() => setImporting(true)} className={buttonClass()}>
                    <ArrowUpTrayIcon className="size-4" />
                    Import attendees
                  </button>
                )
              }
            />
          ) : (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title="No delegates match these filters"
              action={
                <button type="button" onClick={clearFilters} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  Clear filters
                </button>
              }
            />
          )
        ) : (
          <div {...tableScroll} className={cn('relative overflow-x-auto transition-opacity', tableScrollFocus, delegates.isFetching && delegates.data && 'opacity-60')}>
            <table className="w-full min-w-[60rem] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Delegate
                  </th>
                  <th scope="col" className={th}>
                    Organisation
                  </th>
                  <th scope="col" className={th}>
                    Tier
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    Registered
                  </th>
                  <th scope="col" className={cn(th, 'w-56')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((d) => {
                  const s = statusOf(d);
                  return (
                    <tr key={d.id} className="even:bg-surface-soft last:[&>td]:border-b-0">
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          {/* The list carries raw storage keys, not viewable photo URLs, so initials stand in. */}
                          <Avatar name={d.name} size={32} />
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-ink-soft">{d.name}</p>
                            <p className="truncate text-xs text-placeholder">{d.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, 'max-w-56')}>
                        {d.organisation ? (
                          <>
                            <p className="truncate text-ink-soft">{d.organisation}</p>
                            {d.title && <p className="truncate text-xs text-placeholder">{d.title}</p>}
                          </>
                        ) : (
                          <span className="text-placeholder">Not given</span>
                        )}
                      </td>
                      <td className={td}>
                        {d.tickets?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {d.tickets.map((t) => (
                              <Tag key={t.ticketId} tone="primary">
                                {t.tierName}
                                {manyEvents ? ` · ${shortNames.get(t.editionId) ?? 'event'}` : ''}
                              </Tag>
                            ))}
                          </div>
                        ) : (
                          <span className="text-placeholder">No ticket</span>
                        )}
                      </td>
                      <td className={td}>
                        <Tag tone={STATUS_TONE[s]} dot>
                          {STATUS_LABEL[s]}
                        </Tag>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-ink-soft')}>{registered(d.createdAt)}</td>
                      <td className={cn(td, 'text-right')}>
                        <div className={cn('flex justify-end gap-1', scoped && 'hidden')}>
                          {s === 'pending' && (
                            <button type="button" onClick={() => approve(d, true)} disabled={actions.setApproval.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
                              <CheckCircleIcon className="size-4" />
                              Approve
                            </button>
                          )}
                          {s === 'approved' && (
                            <button type="button" onClick={() => approve(d, false)} disabled={actions.setApproval.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
                              <ArrowUturnLeftIcon className="size-4" />
                              Send back
                            </button>
                          )}
                          {(() => {
                            const ticket = ticketHere(d);
                            return ticket && eventTiers.length > 1 ? (
                              <button type="button" onClick={() => openTier(d, ticket)} className={buttonClass({ style: 'outline', color: 'gray' })}>
                                Change tier
                              </button>
                            ) : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!changing}
        title={`Change ${changing?.delegate.name ?? 'delegate'}’s tier`}
        confirmLabel="Change tier"
        pendingLabel="Changing…"
        pending={actions.moveTicket.isPending}
        onConfirm={() => void confirmTier()}
        onCancel={() => setChanging(null)}
      >
        <div className="flex flex-col gap-3">
          <p>Moves their {shortNames.get(editionId ?? '') ?? 'event'} ticket to another of its tiers. Their QR keeps working; reprint their badge to show the new tier.</p>
          <Select label="New tier" value={newTier} options={eventTiers.map((t) => ({ value: t.id, label: t.name }))} onChange={setNewTier} />
          {actions.moveTicket.error && <p className="text-xs text-danger">{actions.moveTicket.error.message}</p>}
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={approvingAll}
        title={`Approve ${counts.pending} pending ${counts.pending === 1 ? 'delegate' : 'delegates'}?`}
        confirmLabel="Approve all"
        pendingLabel="Approving…"
        pending={actions.approveAll.isPending}
        onConfirm={() => void confirmApproveAll()}
        onCancel={() => setApprovingAll(false)}
      >
        Everyone waiting for review gets in, with the tickets they hold.
      </ConfirmDialog>
    </div>
  );
}

/** Reads `?q=` (the navbar search lands here); a new search remounts the view with that text. */
function DelegatesFromUrl() {
  const q = useSearchParams().get('q') ?? '';
  return <DelegatesView key={q} initialQuery={q} />;
}

export default function DelegatesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <DelegatesFromUrl />
    </Suspense>
  );
}
