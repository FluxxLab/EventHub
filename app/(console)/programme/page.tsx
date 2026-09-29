'use client';

import Link from 'next/link';
import { MagnifyingGlassIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { CreateSessionDialog } from '@/components/programme/create-session-dialog';
import { SessionSpeakersDialog } from '@/components/programme/session-speakers-dialog';
import { Avatar } from '@/components/shell/avatar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { sessionTrackOptions, trackLabel } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { useEditions } from '@/lib/events/use-editions';
import {
  dayDate,
  durationMinutes,
  filterSessions,
  MAX_DAY,
  STATUS_LABEL,
  timeRange,
  typeLabel,
  type Session,
  type SessionStatus,
  type SessionTrack,
} from '@/lib/programme/programme';
import { useDeleteSession, useSessions, useSessionsRealtime } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<SessionStatus, TagTone> = { scheduled: 'gray', live: 'green', completed: 'primary' };

const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm text-ink align-middle';

/** Reads `?edition=&day=&q=` (global search lands here); a new link remounts the view with them. */
function ProgrammeFromUrl() {
  const params = useSearchParams();
  const initial = { edition: params.get('edition'), day: Number(params.get('day')) || 1, q: params.get('q') ?? '' };
  return <ProgrammeView key={params.toString()} initial={initial} />;
}

export default function ProgrammePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <ProgrammeFromUrl />
    </Suspense>
  );
}

function ProgrammeView({ initial }: { initial: { edition: string | null; day: number; q: string } }) {
  useSessionsRealtime();
  const editions = useEditions();
  const [pickedEdition, setPickedEdition] = useState<string | null>(initial.edition);
  // The edition the app shows is the natural default; otherwise the newest.
  const edition = editions.data?.find((e) => e.id === pickedEdition) ?? editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const sessions = useSessions(edition?.id);

  const [day, setDay] = useState(initial.day);
  const [track, setTrack] = useState<SessionTrack | 'all'>('all');
  const [speakersFor, setSpeakersFor] = useState<Session | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [deletingSession, setDeletingSession] = useState<Session | null>(null);
  const trackLibrary = useTrackLibrary();
  const library = trackLibrary.data ?? [];
  const trackFilter = [{ value: 'all', label: 'All tracks' }, ...sessionTrackOptions(library, edition?.trackValues)];
  const [query, setQuery] = useState(initial.q);
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => sessions.data ?? [], [sessions.data]);
  const rows = useMemo(
    () => filterSessions(all, { track, query }).filter((s) => s.day === day).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [all, track, query, day],
  );
  const countByDay = (n: number) => all.filter((s) => s.day === n).length;

  if (editions.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (!edition) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-surface p-10 text-center">
        <h1 className="text-xl font-medium text-ink">No events yet</h1>
        <p className="mt-2 text-sm text-muted">A programme belongs to an event. Create the event first, then add its sessions here.</p>
        <Link href="/events" className={buttonClass({ className: 'mt-6' })}>
          Go to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Programme: {edition.name}</h1>

      <section
        aria-labelledby="programme-title"
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 id="programme-title" className="text-xl font-medium text-ink">
              Programme
            </h2>
            <div className="w-72 max-w-full">
              <Select
                label="Event"
                value={edition.id}
                options={(editions.data ?? []).map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))}
                onChange={(v) => {
                  setPickedEdition(v);
                  setDay(1);
                }}
              />
            </div>
          </div>
          <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
            <PlusIcon className="size-4" />
            Add session
          </button>
        </header>

        {/* Toolbar: the day tabs, then the filters. */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div role="tablist" aria-label="Day" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
            {Array.from({ length: MAX_DAY }, (_, i) => i + 1).map((n) => {
              const date = new Date(`${dayDate(edition.startsAt, n)}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              return (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={day === n}
                  onClick={() => setDay(n)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                    day === n ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink',
                  )}
                >
                  Day {n}
                  <span className="text-xs font-normal text-[#7c7c7c]">{date}</span>
                  <Tag tone={day === n ? 'primary' : 'gray'}>{countByDay(n)}</Tag>
                </button>
              );
            })}
          </div>
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
        </div>

        {sessions.isError && !sessions.data ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">The programme could not load.</p>
            <p className="mt-1 text-sm text-muted">{sessions.error.message}</p>
            <button type="button" onClick={() => void sessions.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto" role="tabpanel">
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
              <tbody aria-busy={sessions.isPending}>
                {sessions.isPending ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} className="even:bg-[#f6f6f6]">
                      <td colSpan={7} className={td}>
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                      {all.length === 0 || countByDay(day) === 0 ? (
                        <>
                          Nothing on Day {day} yet.{' '}
                          <button type="button" onClick={() => setAdding(true)} className="font-medium text-primary hover:underline">
                            Add a session
                          </button>
                        </>
                      ) : (
                        'No sessions match these filters.'
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((s) => (
                    <tr key={s.id} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                      <td className={cn(td, 'whitespace-nowrap')}>
                        <p className="tabular-nums text-ink">{timeRange(s.startsAt, s.endsAt)}</p>
                        <p className="text-xs text-placeholder">{durationMinutes(s.startsAt, s.endsAt)} min</p>
                      </td>
                      <td className={cn(td, 'max-w-md')}>
                        <p className="truncate text-[#525252]" title={s.title}>
                          {s.title}
                        </p>
                        <p className="mt-1">
                          <Tag>{typeLabel(s.type)}</Tag>
                        </p>
                      </td>
                      <td className={cn(td, 'max-w-48 truncate text-[#525252]')} title={trackLabel(s.track, library)}>
                        {trackLabel(s.track, library)}
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-[#525252]')}>{s.room}</td>
                      <td className={td}>
                        {s.speakers.length === 0 ? (
                          <button type="button" onClick={() => setSpeakersFor(s)} className="inline-flex items-center gap-1 rounded text-sm text-primary hover:underline">
                            <PlusIcon className="size-4" /> Add speakers
                          </button>
                        ) : (
                          <button type="button" onClick={() => setSpeakersFor(s)} aria-label={`Change speakers for ${s.title}`} className="-m-1 flex items-center gap-2 rounded-lg p-1 text-left hover:bg-primary-soft/50">
                            <div className="flex -space-x-2">
                              {s.speakers.slice(0, 3).map((sp) => (
                                <Avatar key={sp.id} name={sp.name} src={sp.avatarUrl} size={28} className="rounded-full ring-2 ring-surface" />
                              ))}
                            </div>
                            <span className="max-w-40 truncate text-xs text-[#525252]" title={s.speakers.map((sp) => sp.name).join(', ')}>
                              {s.speakers[0]!.name}
                              {s.speakers.length > 1 && ` +${s.speakers.length - 1}`}
                            </span>
                          </button>
                        )}
                      </td>
                      <td className={td}>
                        <Tag tone={STATUS_TONE[s.status]} dot>
                          {STATUS_LABEL[s.status]}
                        </Tag>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <RowActions name={s.title} onEdit={() => setEditingSession(s)} onDelete={() => setDeletingSession(s)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
