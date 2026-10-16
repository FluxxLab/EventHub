'use client';

import Link from 'next/link';
import { CalendarDaysIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { CreateSessionDialog } from '@/components/programme/create-session-dialog';
import { SessionSpeakersDialog } from '@/components/programme/session-speakers-dialog';
import { SessionStatusPicker } from '@/components/programme/session-status';
import { Avatar } from '@/components/shell/avatar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { sessionTrackOptions, trackLabel } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { dayDate, durationMinutes, filterSessions, MAX_DAY, timeRange, typeLabel, type Session, type SessionTrack } from '@/lib/programme/programme';
import { useDeleteSession, useSessions, useSessionsRealtime } from '@/lib/programme/use-sessions';
import { useCallActions } from '@/lib/calls-to-action/use-calls-to-action';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm text-ink align-middle';

const DAYS = Array.from({ length: MAX_DAY }, (_, i) => String(i + 1));

/**
 * Reads `?edition=&q=` (global search lands here); a new link remounts the view with them. The day
 * and track stay in the address too, read where they are used, so changing them keeps the view.
 */
function ProgrammeFromUrl() {
  const params = useSearchParams();
  const initial = { edition: params.get('edition'), q: params.get('q') ?? '' };
  return <ProgrammeView key={`${initial.edition ?? ''}|${initial.q}`} initial={initial} />;
}

export default function ProgrammePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ProgrammeFromUrl />
    </Suspense>
  );
}

function ProgrammeView({ initial }: { initial: { edition: string | null; q: string } }) {
  useSessionsRealtime();
  const working = useWorkingEdition();
  const editions = working.editions;
  const [pickedEdition, setPickedEdition] = useState<string | null>(initial.edition);
  // The edition the app shows is the natural default; otherwise the newest.
  const edition = editions.data?.find((e) => e.id === pickedEdition) ?? working.edition;
  const callActions = useCallActions(edition?.id ?? '');
  const toast = useToast();
  const sessions = useSessions(edition?.id);

  const [dayParam, setDayParam] = useUrlParam('day', '1', DAYS);
  const day = Number(dayParam);
  const [trackParam, setTrack] = useUrlParam<string>('track', 'all');
  const [speakersFor, setSpeakersFor] = useState<Session | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [deletingSession, setDeletingSession] = useState<Session | null>(null);
  const trackLibrary = useTrackLibrary();
  const library = trackLibrary.data ?? [];
  const trackFilter = [{ value: 'all', label: 'All tracks' }, ...sessionTrackOptions(library, edition?.trackValues)];
  // a track from an old link that this event does not have shows everything
  const track = (trackFilter.some((o) => o.value === trackParam) ? trackParam : 'all') as SessionTrack | 'all';
  const [query, setQuery] = useState(initial.q);
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => sessions.data ?? [], [sessions.data]);
  const rows = useMemo(
    () =>
      filterSessions(all, { track, query })
        .filter((s) => s.day === day)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [all, track, query, day],
  );
  const countByDay = (n: number) => all.filter((s) => s.day === n).length;

  if (editions.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!edition) {
    return (
      <div className="mx-auto mt-10 w-full max-w-lg">
        <h1 className="sr-only">Programme</h1>
        <EmptyState
          framed
          icon={CalendarDaysIcon}
          title="No events yet"
          body="A programme belongs to an event. Create the event first."
          action={
            <Link href="/events" className={buttonClass()}>
              Go to Events
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Programme: {edition.name}</h1>

      <Panel
        title="Programme"
        actions={
          <>
            <div className="w-72 max-w-full">
              <Select
                label="Event"
                value={edition.id}
                options={(editions.data ?? []).map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))}
                onChange={(v) => {
                  setPickedEdition(v);
                  working.setEditionId(v);
                  setDayParam('1');
                }}
              />
            </div>
            <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Add session
            </button>
          </>
        }
        toolbar={
          <>
            <SegmentedTabs
              label="Day"
              value={dayParam}
              onChange={setDayParam}
              options={DAYS.map((d) => {
                const date = new Date(`${dayDate(edition.startsAt, Number(d))}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                return { value: d, label: `Day ${d} · ${date}`, count: countByDay(Number(d)) };
              })}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-64">
                <Select label="Track" value={track} options={trackFilter} onChange={setTrack} />
              </div>
              <TextInput
                icon={MagnifyingGlassIcon}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions, rooms, speakers"
                aria-label="Search sessions"
                className="w-64"
              />
            </div>
          </>
        }
      >
        {sessions.isError && !sessions.data ? (
          <ErrorState title="The programme could not load" error={sessions.error} onRetry={() => void sessions.refetch()} />
        ) : sessions.isPending ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          countByDay(day) === 0 ? (
            <EmptyState
              icon={CalendarDaysIcon}
              title={`Nothing on Day ${day} yet`}
              body="Add the day's talks, panels and breaks."
              action={
                <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                  <PlusIcon className="size-4" />
                  Add session
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title="No sessions match these filters"
              action={
                <button
                  type="button"
                  onClick={() => {
                    setTrack('all');
                    setQuery('');
                  }}
                  className={buttonClass({ style: 'outline', color: 'gray' })}
                >
                  Clear filters
                </button>
              }
            />
          )
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[60rem] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(th, 'w-40')}>
                    Time
                  </th>
                  <th scope="col" className={th}>
                    Session
                  </th>
                  <th scope="col" className={th}>
                    Track
                  </th>
                  <th scope="col" className={th}>
                    Room
                  </th>
                  <th scope="col" className={th}>
                    Speakers
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={cn(th, 'w-24')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="even:bg-surface-soft last:[&>td]:border-b-0">
                    <td className={cn(td, 'whitespace-nowrap')}>
                      <p className="tabular-nums text-ink">{timeRange(s.startsAt, s.endsAt)}</p>
                      <p className="text-xs text-placeholder">{durationMinutes(s.startsAt, s.endsAt)} min</p>
                    </td>
                    <td className={cn(td, 'max-w-md')}>
                      <p className="truncate text-ink-soft" title={s.title}>
                        {s.title}
                      </p>
                      <p className="mt-1">
                        <Tag>{typeLabel(s.type)}</Tag>
                      </p>
                    </td>
                    <td className={cn(td, 'max-w-48 truncate text-ink-soft')} title={trackLabel(s.track, library)}>
                      {trackLabel(s.track, library)}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-ink-soft')}>{s.room}</td>
                    <td className={td}>
                      {s.speakers.length === 0 ? (
                        <button type="button" onClick={() => setSpeakersFor(s)} className="inline-flex items-center gap-1 rounded text-sm text-primary hover:underline">
                          <PlusIcon className="size-4" /> Add speakers
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSpeakersFor(s)}
                          aria-label={`Change speakers for ${s.title}`}
                          className="-m-1 flex items-center gap-2 rounded-lg p-1 text-left hover:bg-primary-soft/50"
                        >
                          <div className="flex -space-x-2">
                            {s.speakers.slice(0, 3).map((sp) => (
                              <Avatar key={sp.id} name={sp.name} src={sp.avatarUrl} size={28} className="rounded-full ring-2 ring-surface" />
                            ))}
                          </div>
                          <span className="max-w-40 truncate text-xs text-ink-soft" title={s.speakers.map((sp) => sp.name).join(', ')}>
                            {s.speakers[0]!.name}
                            {s.speakers.length > 1 && ` +${s.speakers.length - 1}`}
                          </span>
                        </button>
                      )}
                    </td>
                    <td className={td}>
                      <SessionStatusPicker session={s} editionId={edition.id} className="w-36" />
                    </td>
                    <td className={cn(td, 'text-right')}>
                      <RowActions
                        name={s.title}
                        actions={[
                          {
                            label: callActions.analyse.isPending ? 'Analysing…' : 'Analyse for calls to action',
                            icon: SparklesIcon,
                            disabled: callActions.analyse.isPending,
                            onSelect: () => {
                              toast.push({ title: 'Analysing', body: `Reading “${s.title}”. This takes a minute or two.` });
                              callActions.analyse.mutate(
                                { sessionId: s.id },
                                {
                                  onSuccess: (r) =>
                                    toast.push({ title: r.added.length ? 'Calls to action found' : 'Analysis done', body: `${r.message} Review them under Records › Calls to action.` }),
                                  onError: (e) => toast.push({ title: 'Not analysed', body: e.message }),
                                },
                              );
                            },
                          },
                        ]}
                        onEdit={() => setEditingSession(s)}
                        onDelete={() => setDeletingSession(s)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CreateSessionDialog open={adding} onClose={() => setAdding(false)} edition={edition} day={day} />
      <SessionSpeakersDialog session={speakersFor} editionId={edition.id} onClose={() => setSpeakersFor(null)} />
      <CreateSessionDialog open={editingSession !== null} session={editingSession} onClose={() => setEditingSession(null)} edition={edition} day={editingSession?.day ?? day} />
      <DeleteSessionDialog editionId={edition.id} session={deletingSession} onClose={() => setDeletingSession(null)} />
    </div>
  );
}

/** "Delete session?", with the API's reason when delegates have used it (attendance, questions, comments…). */
function DeleteSessionDialog({ editionId, session, onClose }: { editionId: string; session: Session | null; onClose: () => void }) {
  const remove = useDeleteSession(editionId);
  const toast = useToast();
  const close = () => {
    remove.reset();
    onClose();
  };
  return (
    <DeleteDialog
      open={session !== null}
      title="Delete this session?"
      pending={remove.isPending}
      refusal={remove.error?.message ?? null}
      onConfirm={() =>
        session &&
        remove.mutate(session.id, {
          onSuccess: () => {
            toast.push({ title: 'Session deleted', leading: { kind: 'icon', icon: TrashIcon }, body: `${session.title} is off the programme and delegates’ agendas.` });
            close();
          },
        })
      }
      onCancel={close}
    >
      {session ? `“${session.title}” leaves the programme and delegates’ agendas. ` : ''}A session delegates have attended, asked questions in or commented on cannot be deleted.
    </DeleteDialog>
  );
}
