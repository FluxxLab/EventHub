'use client';

import Link from 'next/link';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowRightCircleIcon, ArrowUpTrayIcon, CalendarDaysIcon, DocumentDuplicateIcon, DocumentTextIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { CreateSessionDialog } from '@/components/programme/create-session-dialog';
import { ImportSessionsDialog } from '@/components/programme/import-sessions-dialog';
import { MoveCaptionsDialog } from '@/components/programme/move-captions-dialog';
import { DayTranscriptDialog } from '@/components/programme/day-transcript-dialog';
import { SessionBriefDialog } from '@/components/programme/session-brief-dialog';
import { UploadBriefsDialog } from '@/components/programme/upload-briefs-dialog';
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
import { useSessionBriefs } from '@/lib/programme/use-briefs';
import { useSession } from '@/lib/auth/session';
import { downloadTranscript } from '@/lib/captions/use-captions';
import { recheckNames } from '@/lib/captions/speaker-names';
import { useCallActions } from '@/lib/calls-to-action/use-calls-to-action';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm text-ink align-middle';

const DAYS = Array.from({ length: MAX_DAY }, (_, i) => String(i + 1));

/**
 * Reads `?edition=&q=` (global search lands here); a new link remounts the view with them, and its
 * event becomes the working event (the top bar's). The day
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
  const { setEditionId } = working;
  // the event is the top bar's; a search result for another event switches it there
  useEffect(() => {
    if (initial.edition) setEditionId(initial.edition);
  }, [initial.edition, setEditionId]);
  const edition = working.edition;
  const callActions = useCallActions(edition?.id ?? '');
  const toast = useToast();
  const sessions = useSessions(edition?.id);

  const [dayParam, setDayParam] = useUrlParam('day', '1', DAYS);
  const day = Number(dayParam);
  const [trackParam, setTrack] = useUrlParam<string>('track', 'all');
  const [speakersFor, setSpeakersFor] = useState<Session | null>(null);
  const [briefFor, setBriefFor] = useState<Session | null>(null);
  const [uploadingBriefs, setUploadingBriefs] = useState(false);
  const briefs = useSessionBriefs(edition?.id);
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const [rechecking, setRechecking] = useState<Set<string>>(new Set());
  const [movingFrom, setMovingFrom] = useState<Session | null>(null);
  const [dayTranscript, setDayTranscript] = useState(false);
  const getTranscript = (s: Session, format: 'csv' | 'txt') =>
    void downloadTranscript(s.id, s.title, format).catch((e: Error) => toast.push({ title: 'Transcript not downloaded', body: e.message }));
  const runRecheck = (s: Session) => {
    setRechecking((was) => new Set(was).add(s.id));
    toast.push({ title: 'Rechecking speaker names', body: `Reading “${s.title}”. This takes a minute or two.` });
    recheckNames(s.id)
      .then(({ added, changed }) => toast.push({ title: 'Speaker names rechecked', body: `“${s.title}”: ${added} added, ${changed} changed. Download the transcript to see them.` }))
      .catch((e: Error) => toast.push({ title: 'Names not rechecked', body: e.message }))
      .finally(() =>
        setRechecking((was) => {
          const next = new Set(was);
          next.delete(s.id);
          return next;
        }),
      );
  };
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [deletingSession, setDeletingSession] = useState<Session | null>(null);
  const trackLibrary = useTrackLibrary();
  const library = trackLibrary.data ?? [];
  const trackFilter = [{ value: 'all', label: 'All tracks' }, ...sessionTrackOptions(library, edition?.trackValues)];
  // a track from an old link that this event does not have shows everything
  const track = (trackFilter.some((o) => o.value === trackParam) ? trackParam : 'all') as SessionTrack | 'all';
  const [query, setQuery] = useState(initial.q);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

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
      <div className="mt-10 w-full max-w-lg">
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
        description={edition.name}
        actions={
          <>
            {all.some((s) => s.day === day && s.status !== 'scheduled') && (
              <button type="button" onClick={() => setDayTranscript(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
                <ArrowDownTrayIcon className="size-4" />
                Day transcript
              </button>
            )}
            {all.length > 0 && (
              <button type="button" onClick={() => setUploadingBriefs(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
                <DocumentDuplicateIcon className="size-4" />
                Upload briefs
              </button>
            )}
            <button type="button" onClick={() => setImporting(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
              <ArrowUpTrayIcon className="size-4" />
              Import sessions
            </button>
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
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="w-full sm:w-64">
                <Select label="Track" value={track} options={trackFilter} onChange={setTrack} />
              </div>
              <TextInput
                icon={MagnifyingGlassIcon}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions"
                aria-label="Search sessions, rooms and speakers"
                title="Search by title, room or speaker"
                className="w-full sm:w-64"
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
              body="Add the day's talks, panels and breaks, or import the whole programme from a spreadsheet."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => setImporting(true)} className={buttonClass({ style: 'soft', color: 'gray' })}>
                    <ArrowUpTrayIcon className="size-4" />
                    Import sessions
                  </button>
                  <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                    <PlusIcon className="size-4" />
                    Add session
                  </button>
                </div>
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
                      <p className="mt-1 flex items-center gap-1.5">
                        <Tag>{typeLabel(s.type)}</Tag>
                        {briefs.data?.has(s.id) && (
                          <button
                            type="button"
                            onClick={() => setBriefFor(s)}
                            title={briefs.data.get(s.id)!.fileName ? `Brief: ${briefs.data.get(s.id)!.fileName}` : 'Has a brief'}
                            aria-label={`Session brief for ${s.title}`}
                            className="rounded-full"
                          >
                            <Tag tone="primary">
                              <DocumentTextIcon className="size-3" /> Brief
                            </Tag>
                          </button>
                        )}
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
                          {/* a slight overlap, so each avatar's initials stay readable */}
                          <div className="flex -space-x-1">
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
                      <SessionStatusPicker session={s} editionId={edition.id} className="h-8 w-32 px-2.5 shadow-none" />
                    </td>
                    <td className={cn(td, 'text-right')}>
                      <RowActions
                        name={s.title}
                        actions={[
                          { label: briefs.data?.has(s.id) ? 'Session brief' : 'Add session brief', icon: DocumentTextIcon, onSelect: () => setBriefFor(s) },
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
                          // the transcript of a session once it has started; after it ends, the re-transcribed one with voices apart
                          ...(s.status !== 'scheduled'
                            ? [
                                { label: 'Download transcript (.txt)', icon: ArrowDownTrayIcon, onSelect: () => getTranscript(s, 'txt') },
                                { label: 'Download transcript (.csv)', icon: ArrowDownTrayIcon, onSelect: () => getTranscript(s, 'csv') },
                              ]
                            : []),
                          // names the voices of a finished session from its introductions (admins and session operators)
                          ...(s.status === 'completed' && isAdmin
                            ? [
                                {
                                  label: rechecking.has(s.id) ? 'Rechecking speaker names…' : 'Recheck speaker names',
                                  icon: ArrowPathIcon,
                                  disabled: rechecking.has(s.id),
                                  onSelect: () => runRecheck(s),
                                },
                              ]
                            : []),
                          // the wrong session was left live: hand its lines to the one they belong to
                          ...(s.status !== 'scheduled' && isAdmin ? [{ label: 'Move captions to…', icon: ArrowRightCircleIcon, onSelect: () => setMovingFrom(s) }] : []),
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
      {/* remounted on each open, so it starts from a clean sheet */}
      <ImportSessionsDialog key={importing ? 'import-open' : 'import-closed'} open={importing} edition={edition} day={day} onClose={() => setImporting(false)} />
      <SessionSpeakersDialog session={speakersFor} editionId={edition.id} onClose={() => setSpeakersFor(null)} />
      <SessionBriefDialog session={briefFor} editionId={edition.id} onClose={() => setBriefFor(null)} />
      {/* remounted on each open, so it starts empty */}
      <UploadBriefsDialog key={uploadingBriefs ? 'briefs-open' : 'briefs-closed'} open={uploadingBriefs} edition={edition} onClose={() => setUploadingBriefs(false)} />
      <CreateSessionDialog open={editingSession !== null} session={editingSession} onClose={() => setEditingSession(null)} edition={edition} day={editingSession?.day ?? day} />
      <DeleteSessionDialog editionId={edition.id} session={deletingSession} onClose={() => setDeletingSession(null)} />
      <MoveCaptionsDialog session={movingFrom} sessions={all} onClose={() => setMovingFrom(null)} />
      {/* remounted on each open, so it starts on all rooms */}
      <DayTranscriptDialog key={dayTranscript ? 'day-open' : 'day-closed'} open={dayTranscript} day={day} sessions={all} eventName={edition.shortName ?? edition.name} onClose={() => setDayTranscript(false)} />
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
