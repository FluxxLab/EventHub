'use client';

import { ChevronDownIcon, ChevronUpIcon, PencilSquareIcon, PlusIcon, TrashIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { HandRaisedIcon, PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { useMemo, useState } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { PitchDialog, TopicDialog } from '@/components/pitchathon/pitch-dialogs';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { runsEvents, useSession } from '@/lib/auth/session';
import { count } from '@/lib/format';
import { moveTopic, standings, winners, type PitchEntry, type PitchTopic } from '@/lib/pitchathon/pitchathon';
import { usePitchathonActions, useTopics } from '@/lib/pitchathon/use-pitchathon';
import { shares } from '@/lib/polls/polls';
import { trackLabel } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const votes = (n: number) => `${count(n)} ${n === 1 ? 'vote' : 'votes'}`;

function StatusPill({ topic }: { topic: PitchTopic }) {
  if (topic.voting === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
        Voting open
      </span>
    );
  }
  if (topic.voting === 'closed') return <Tag>{topic.closedAt ? `Closed ${hm(topic.closedAt)}` : 'Closed'}</Tag>;
  return <Tag>Not open</Tag>;
}

function TopicItem({
  topic,
  index,
  total,
  selected,
  canEdit,
  onSelect,
  onMove,
}: {
  topic: PitchTopic;
  index: number;
  total: number;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const win = winners(topic);
  const winner = topic.entries.find((e) => e.id === win[0]);
  const meta =
    topic.voting === 'closed'
      ? winner
        ? `Won by ${winner.innovatorName}${win.length > 1 ? ' (tie)' : ''}`
        : 'Closed without votes'
      : topic.voting === 'open'
        ? `${votes(topic.voters)} so far`
        : `${topic.entries.length} ${topic.entries.length === 1 ? 'pitch' : 'pitches'}`;
  return (
    <li className="group relative">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className={cn(
          'flex cursor-pointer items-center gap-3 border-l-2 py-3 pr-12 pl-4 transition-colors',
          selected ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]',
        )}
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
            topic.voting === 'open' ? 'bg-danger text-on-primary' : topic.voting === 'closed' ? 'bg-[#e8e8e8] text-[#525252]' : 'border border-border text-[#525252]',
          )}
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{topic.name}</p>
          <p className={cn('mt-0.5 truncate text-xs', topic.voting === 'open' ? 'text-danger' : 'text-[#7c7c7c]')}>{meta}</p>
        </div>
      </div>
      {canEdit && (
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move “${topic.name}” up`} className="rounded p-0.5 text-[#7c7c7c] hover:text-ink disabled:opacity-30">
            <ChevronUpIcon className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move “${topic.name}” down`} className="rounded p-0.5 text-[#7c7c7c] hover:text-ink disabled:opacity-30">
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function PitchRow({
  pitch,
  rank,
  share,
  topic,
  isWinner,
  canEdit,
  onEdit,
  onDelete,
}: {
  pitch: PitchEntry;
  rank: number;
  share: number;
  topic: PitchTopic;
  isWinner: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const counted = topic.voting !== 'pending';
  const tracks = useTrackLibrary().data ?? [];
  return (
    <li className={cn('px-6 py-4', isWinner && 'bg-[#fdf6e0]/60')}>
      <div className="flex items-start gap-4">
        <span className="w-5 shrink-0 pt-0.5 text-right text-sm tabular-nums text-[#7c7c7c]">{rank}</span>
        <div className="min-w-0 flex-1">
          {/* Name line carries the actions, so the description and bar get the full width. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[15px] font-medium text-ink">{pitch.innovatorName}</p>
              {isWinner && (
                <Tag tone="gold">
                  <TrophyIcon className="size-3" /> Winner
                </Tag>
              )}
              <span className="text-xs text-[#7c7c7c]">
                {pitch.country} · {trackLabel(pitch.track, tracks)}
              </span>
            </div>
            {canEdit && (
              <div className="-mt-1 -mr-2 flex shrink-0">
                <Tooltip label="Edit"><button type="button" onClick={onEdit} aria-label={`Edit ${pitch.innovatorName}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                  <PencilSquareIcon className="size-4" />
                </button></Tooltip>
                <Tooltip label="Remove"><button
                  type="button"
                  onClick={onDelete}
                  aria-label={`Remove ${pitch.innovatorName}`}
                 
                  className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
                >
                  <TrashIcon className="size-4" />
                </button></Tooltip>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm leading-5 text-[#525252]">{pitch.description}</p>
          {counted && (
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f1f1]">
                <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', rank === 1 ? 'bg-primary' : 'bg-primary/35')} style={{ width: `${share}%` }} />
              </div>
              <span className="shrink-0 text-right text-sm tabular-nums text-[#525252]">
                {share}% <span className="text-[#7c7c7c]">· {count(pitch.voteCount)}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ConnectionDot() {
  const connection = useRealtimeStatus();
  const label = { live: 'Updating live', connecting: 'Connecting…', offline: 'Offline', demo: 'Demo data' }[connection];
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#7c7c7c]">
      <span
        className={cn('size-1.5 rounded-full', connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder')}
        aria-hidden
      />
      {label}
    </span>
  );
}

type Pending =
  | { kind: 'open'; topic: PitchTopic }
  | { kind: 'close'; topic: PitchTopic }
  | { kind: 'delete-topic'; topic: PitchTopic }
  | { kind: 'delete-pitch'; topic: PitchTopic; pitch: PitchEntry };

/** The pitchathon for one event: its topics (ballots), their pitches and the live standing. */
export default function PitchathonPage() {
  const page = usePageEdition();
  return <EventBar page={page}>{(editionId) => <PitchBoard editionId={editionId} />}</EventBar>;
}

function PitchBoard({ editionId }: { editionId: string }) {
  const session = useSession();
  const canEdit = session.status === 'signed-in' && runsEvents(session.user.tier);
  const topics = useTopics(editionId);
  const { saveTopic, reorder, setVoting, removeTopic, savePitch, removePitch } = usePitchathonActions(editionId);
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [topicDialog, setTopicDialog] = useState<{ name: string | null; id?: string } | null>(null);
  const [pitchDialog, setPitchDialog] = useState<{ pitch: PitchEntry | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const all = useMemo(() => topics.data ?? [], [topics.data]);
  const live = all.find((t) => t.voting === 'open');
  const selected = all.find((t) => t.id === picked) ?? live ?? all.find((t) => t.voting === 'pending') ?? all[0] ?? null;
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: StopIcon, tone: 'danger' } });

  const confirm = () => {
    if (!pending) return;
    const done = () => setPending(null);
    if (pending.kind === 'open') setVoting.mutate({ id: pending.topic.id, action: 'open' }, { onSuccess: done, onError: fail('Voting not opened') });
    else if (pending.kind === 'close') setVoting.mutate({ id: pending.topic.id, action: 'close' }, { onSuccess: done, onError: fail('Voting not closed') });
    else if (pending.kind === 'delete-topic')
      removeTopic.mutate(
        { id: pending.topic.id },
        {
          onSuccess: () => {
            done();
            setPicked(null);
          },
          onError: fail('Topic not deleted'),
        },
      );
    else removePitch.mutate({ id: pending.pitch.id }, { onSuccess: done, onError: fail('Pitch not removed') });
  };

  if (topics.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (topics.isError && !topics.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">The Pitchathon could not load.</p>
        <p className="mt-1 text-sm text-muted">{topics.error.message}</p>
        <button type="button" onClick={() => void topics.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  const dialogs = (
    <>
      <TopicDialog
        open={!!topicDialog}
        name={topicDialog?.name ?? null}
        pending={saveTopic.isPending}
        error={saveTopic.error?.message ?? null}
        onSave={(name) =>
          saveTopic.mutate(
            { id: topicDialog?.id, name },
            {
              onSuccess: (saved) => {
                setTopicDialog(null);
                saveTopic.reset();
                setPicked(saved.id);
              },
            },
          )
        }
        onClose={() => {
          setTopicDialog(null);
          saveTopic.reset();
        }}
      />
      {selected && (
        <PitchDialog
          open={!!pitchDialog}
          pitch={pitchDialog?.pitch ?? null}
          topicName={selected.name}
          pending={savePitch.isPending}
          error={savePitch.error?.message ?? null}
          onSave={(body) =>
            savePitch.mutate(
              { id: pitchDialog?.pitch?.id, topicId: selected.id, body },
              {
                onSuccess: () => {
                  setPitchDialog(null);
                  savePitch.reset();
                },
              },
            )
          }
          onClose={() => {
            setPitchDialog(null);
            savePitch.reset();
          }}
        />
      )}
      <ConfirmDialog
        open={!!pending}
        title={
          pending?.kind === 'open'
            ? `Open voting on “${pending.topic.name}”?`
            : pending?.kind === 'close'
              ? `Close voting on “${pending.topic.name}”?`
              : pending?.kind === 'delete-topic'
                ? `Delete “${pending.topic.name}”?`
                : `Remove ${pending?.kind === 'delete-pitch' ? pending.pitch.innovatorName : ''}?`
        }
        confirmLabel={pending?.kind === 'open' ? 'Open voting' : pending?.kind === 'close' ? 'Close and announce' : pending?.kind === 'delete-topic' ? 'Delete topic' : 'Remove pitch'}
        pendingLabel="Working…"
        pending={setVoting.isPending || removeTopic.isPending || removePitch.isPending}
        tone={pending?.kind === 'open' ? 'default' : 'danger'}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        {pending?.kind === 'open' && 'Every pitch in it should have presented: delegates can vote from now, once each, and can change their vote until you close it.'}
        {pending?.kind === 'close' && `The ${votes(pending.topic.voters)} are frozen as the result that gets announced. Voting cannot reopen.`}
        {pending?.kind === 'delete-topic' && `Its ${pending.topic.entries.length} pitches and every vote cast in it are deleted.`}
        {pending?.kind === 'delete-pitch' && (pending.topic.voting === 'pending' ? 'The pitch is removed from the topic.' : `The pitch is removed, with the ${votes(pending.pitch.voteCount)} it received.`)}
      </ConfirmDialog>
    </>
  );

  if (all.length === 0) {
    return (
      <>
        <div className={cn(cardClass, 'mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-6 py-16 text-center')}>
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <HandRaisedIcon className="size-6" />
          </span>
          <div>
            <p className="font-medium text-ink">No topics yet</p>
            <p className="mt-1 max-w-md text-sm text-[#7c7c7c]">Create a topic for each category, add its pitches before the day, then open voting once they have all presented.</p>
          </div>
          {canEdit && (
            <button type="button" onClick={() => setTopicDialog({ name: null })} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Create topic
            </button>
          )}
        </div>
        {dialogs}
      </>
    );
  }

  const ranked = selected ? (selected.voting === 'pending' ? selected.entries : standings(selected)) : [];
  const pct = shares(ranked.map((e) => e.voteCount));
  const won = new Set(selected ? winners(selected) : []);

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section aria-label="Topics" className={cardClass}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm text-[#525252]">Running order</p>
          {canEdit && (
            <button type="button" onClick={() => setTopicDialog({ name: null })} className={buttonClass({ className: 'h-9' })}>
              <PlusIcon className="size-4" />
              New topic
            </button>
          )}
        </header>
        <ul className="divide-y divide-border">
          {all.map((t, i) => (
            <TopicItem
              key={t.id}
              topic={t}
              index={i}
              total={all.length}
              selected={t.id === selected?.id}
              canEdit={canEdit}
              onSelect={() => setPicked(t.id)}
              onMove={(direction) => reorder.mutate(moveTopic(all, t.id, direction), { onError: fail('Order not saved') })}
            />
          ))}
        </ul>
      </section>

      {selected && (
        <section aria-labelledby="topic-name" className={cn(cardClass, 'flex flex-col')}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
            <StatusPill topic={selected} />
            {selected.voting !== 'pending' && (
              <p className="text-sm tabular-nums text-ink" aria-live="polite">
                <span className="text-2xl font-medium">{count(selected.voters)}</span> <span className="text-[#7c7c7c]">{selected.voters === 1 ? 'vote' : 'votes'}</span>
              </p>
            )}
          </header>

          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-2">
            <h2 id="topic-name" className="text-xl text-ink">
              {selected.name}
            </h2>
            {canEdit && (
              <button type="button" onClick={() => setTopicDialog({ name: selected.name, id: selected.id })} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                <PencilSquareIcon className="size-4" />
                Rename
              </button>
            )}
          </div>

          {ranked.length === 0 ? (
            <div className="px-6 pt-4 pb-8 text-sm text-[#7c7c7c]">No pitches in this topic yet.</div>
          ) : (
            <ol className="divide-y divide-border">
              {ranked.map((p, i) => (
                <PitchRow
                  key={p.id}
                  pitch={p}
                  rank={i + 1}
                  share={pct[i] ?? 0}
                  topic={selected}
                  isWinner={won.has(p.id)}
                  canEdit={canEdit}
                  onEdit={() => setPitchDialog({ pitch: p })}
                  onDelete={() => setPending({ kind: 'delete-pitch', topic: selected, pitch: p })}
                />
              ))}
            </ol>
          )}

          {canEdit && selected.voting === 'pending' && (
            <div className="px-6 pb-4">
              <button type="button" onClick={() => setPitchDialog({ pitch: null })} className={buttonClass({ style: 'borderless', color: 'gray', className: '-ml-3' })}>
                <PlusIcon className="size-4" />
                Add pitch
              </button>
            </div>
          )}

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#f6f6f6] px-6 py-3">
            <ConnectionDot />
            {canEdit ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'delete-topic', topic: selected })}
                  className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}
                >
                  <TrashIcon className="size-4" />
                  Delete topic
                </button>
                {selected.voting === 'pending' && (
                  <button
                    type="button"
                    disabled={selected.entries.length < 2}
                    title={selected.entries.length < 2 ? 'Add at least two pitches first' : undefined}
                    onClick={() => setPending({ kind: 'open', topic: selected })}
                    className={buttonClass({ className: 'ml-2' })}
                  >
                    <PlayIcon className="size-4" />
                    Open voting
                  </button>
                )}
                {selected.voting === 'open' && (
                  <button type="button" onClick={() => setPending({ kind: 'close', topic: selected })} className={buttonClass({ color: 'danger', className: 'ml-2' })}>
                    <StopIcon className="size-4" />
                    Close and announce
                  </button>
                )}
                {selected.voting === 'closed' && <span className="ml-2 text-xs text-[#7c7c7c]">Result frozen{selected.closedAt ? ` at ${hm(selected.closedAt)}` : ''}</span>}
              </div>
            ) : (
              <span className="text-xs text-[#7c7c7c]">Organisers run the Pitchathon; you can follow it here.</span>
            )}
          </footer>
        </section>
      )}
      {dialogs}
    </div>
  );
}
