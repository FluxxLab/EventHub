'use client';

import { EyeIcon, EyeSlashIcon, MagnifyingGlassIcon, MicrophoneIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { CreateSpeakerDialog } from '@/components/speakers/create-speaker-dialog';
import { Avatar } from '@/components/shell/avatar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { ScrollHints } from '@/components/ui/scroll-hints';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';
import { useSession } from '@/lib/auth/session';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { timeRange } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { searchSpeakers, sessionsBySpeaker, type Speaker } from '@/lib/speakers/speakers';
import { useDeleteSpeaker, useSetSpeakerReveal, useSpeakerReveal, useSpeakers } from '@/lib/speakers/use-speakers';
import { cn } from '@/lib/utils';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

/** Reads `?q=` (global search lands here); a new search remounts the view with that text. */
function SpeakersFromUrl() {
  const q = useSearchParams().get('q') ?? '';
  return <SpeakersView key={q} initialQuery={q} />;
}

export default function SpeakersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SpeakersFromUrl />
    </Suspense>
  );
}

function SpeakersView({ initialQuery }: { initialQuery: string }) {
  const speakers = useSpeakers();
  const reveal = useSpeakerReveal();
  const setReveal = useSetSpeakerReveal();
  const working = useWorkingEdition();
  const current = working.edition;
  const sessions = useSessions(current?.id);
  const toast = useToast();

  const [query, setQuery] = useState(initialQuery);
  const [adding, setAdding] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null);
  const [deletingSpeaker, setDeletingSpeaker] = useState<Speaker | null>(null);
  const [confirming, setConfirming] = useState(false);
  const auth = useSession();
  const canReveal = auth.status === 'signed-in' && auth.user.tier === 'admin';

  const rows = useMemo(() => searchSpeakers(speakers.data ?? [], query), [speakers.data, query]);
  const bySpeaker = useMemo(() => sessionsBySpeaker(sessions.data ?? []), [sessions.data]);
  const revealed = reveal.data?.revealed ?? false;

  const toggleReveal = () =>
    setReveal.mutate(!revealed, {
      onSuccess: (result) => {
        setConfirming(false);
        toast.push({
          title: result.revealed ? 'Line-up revealed' : 'Line-up hidden',
          leading: { kind: 'icon', icon: result.revealed ? EyeIcon : EyeSlashIcon },
          body: result.revealed ? 'Delegates can now see every speaker. Open apps update straight away.' : 'Speakers show as “to be announced” in the app again.',
        });
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Speakers</h1>

      <Panel
        title="Speakers"
        count={speakers.data?.length}
        actions={
          <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
            <PlusIcon className="size-4" />
            Add speaker
          </button>
        }
        toolbar={
          <TextInput
            icon={MagnifyingGlassIcon}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search speakers"
            aria-label="Search speakers by name, role or organisation"
            title="Search by name, role or organisation"
            className="w-full sm:w-72"
          />
        }
      >
        {/* The line-up switch: who can see these speakers in the app. */}
        {reveal.data && (
          <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 text-sm', revealed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
            <p className="flex items-center gap-2">
              {revealed ? <EyeIcon className="size-5 shrink-0" /> : <EyeSlashIcon className="size-5 shrink-0" />}
              {revealed ? 'The line-up is live: delegates can see every speaker.' : 'The line-up is hidden: delegates see speakers as “to be announced”.'}
            </p>
            {canReveal && (
              <button type="button" onClick={() => setConfirming(true)} className={buttonClass({ style: revealed ? 'outline' : 'fill', color: revealed ? 'gray' : 'primary' })}>
                {revealed ? 'Hide line-up' : 'Reveal line-up'}
              </button>
            )}
          </div>
        )}

        {speakers.isError && !speakers.data ? (
          <ErrorState title="Speakers could not load" error={speakers.error} onRetry={() => void speakers.refetch()} />
        ) : speakers.isPending ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          query ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title="No speakers match that search"
              action={
                <button type="button" onClick={() => setQuery('')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  Clear search
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={MicrophoneIcon}
              title="No speakers yet"
              body="Speakers are shared across events; add one, then put them on sessions."
              action={
                <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
                  <PlusIcon className="size-4" />
                  Add speaker
                </button>
              }
            />
          )
        ) : (
          <div {...tableScroll} className={`relative overflow-x-auto ${tableScrollFocus}`}>
            <ScrollHints />
            <table className="w-full min-w-[48rem] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Speaker
                  </th>
                  <th scope="col" className={th}>
                    Organisation
                  </th>
                  <th scope="col" className={th}>
                    {current ? `Sessions in ${current.shortName}` : 'Sessions'}
                  </th>
                  <th scope="col" className={cn(th, 'w-24')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sp) => {
                  const theirs = bySpeaker.get(sp.id) ?? [];
                  return (
                    <tr key={sp.id} className="even:bg-surface-soft last:[&>td]:border-b-0">
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <Avatar name={sp.name} src={sp.avatarUrl} size={32} />
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-ink-soft">{sp.name}</p>
                            <p className="truncate text-xs text-placeholder">{sp.role ?? 'No role set'}</p>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, 'text-ink-soft')}>{sp.organisation ?? <span className="text-placeholder">Not set</span>}</td>
                      <td className={td}>
                        {theirs.length === 0 ? (
                          <Tag>Not in the programme</Tag>
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {theirs.slice(0, 2).map((s) => (
                              <li key={s.id} className="flex items-baseline gap-2 text-xs">
                                <span className="shrink-0 tabular-nums text-hint">
                                  Day {s.day} · {timeRange(s.startsAt, s.endsAt)}
                                </span>
                                <span className="truncate text-ink-soft">{s.title}</span>
                              </li>
                            ))}
                            {theirs.length > 2 && <li className="text-xs text-hint">+{theirs.length - 2} more</li>}
                          </ul>
                        )}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <RowActions name={sp.name} onEdit={() => setEditingSpeaker(sp)} onDelete={() => setDeletingSpeaker(sp)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CreateSpeakerDialog open={adding} onClose={() => setAdding(false)} />
      <CreateSpeakerDialog open={editingSpeaker !== null} speaker={editingSpeaker} onClose={() => setEditingSpeaker(null)} />
      <DeleteSpeakerDialog speaker={deletingSpeaker} onClose={() => setDeletingSpeaker(null)} />
      <ConfirmDialog
        open={confirming}
        title={revealed ? 'Hide the line-up?' : 'Reveal the line-up?'}
        confirmLabel={revealed ? 'Hide line-up' : 'Reveal line-up'}
        pendingLabel={revealed ? 'Hiding…' : 'Revealing…'}
        pending={setReveal.isPending}
        onConfirm={toggleReveal}
        onCancel={() => setConfirming(false)}
      >
        {revealed
          ? 'Delegates will see speakers as “to be announced” again, in every open app.'
          : 'Every delegate will see all speakers straight away, and open apps get a notification. This is visible to everyone at once.'}
      </ConfirmDialog>
    </div>
  );
}

/** "Delete speaker?", with the sessions they are on when the API refuses. */
function DeleteSpeakerDialog({ speaker, onClose }: { speaker: Speaker | null; onClose: () => void }) {
  const remove = useDeleteSpeaker();
  const toast = useToast();
  const close = () => {
    remove.reset();
    onClose();
  };
  return (
    <DeleteDialog
      open={speaker !== null}
      title={`Delete ${speaker?.name ?? 'this speaker'}?`}
      pending={remove.isPending}
      refusal={remove.error?.message ?? null}
      onConfirm={() =>
        speaker &&
        remove.mutate(speaker.id, {
          onSuccess: () => {
            toast.push({ title: 'Speaker deleted', leading: { kind: 'icon', icon: TrashIcon }, body: `${speaker.name} is gone from the speaker list.` });
            close();
          },
        })
      }
      onCancel={close}
    >
      Speakers are shared across events. One who is on any session cannot be deleted: take them off those sessions first.
    </DeleteDialog>
  );
}
