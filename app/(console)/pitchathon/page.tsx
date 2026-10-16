'use client';

import { ChevronDownIcon, ChevronUpIcon, LightBulbIcon, PencilSquareIcon, PlusIcon, TrashIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { HandRaisedIcon, PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { useMemo, useState } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { PitchDialog, TopicDialog } from '@/components/pitchathon/pitch-dialogs';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState } from '@/components/ui/states';
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
import { useListMotion } from '@/lib/use-list-motion';
import { cn } from '@/lib/utils';

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
    <li className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className={cn('flex cursor-pointer items-center gap-3 py-3 pr-12 pl-4 transition-colors', selected ? 'bg-primary-soft' : 'hover:bg-surface-soft')}
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
            topic.voting === 'open' ? 'bg-danger text-on-primary' : topic.voting === 'closed' ? 'bg-surface-sunken text-ink-soft' : 'border border-border text-ink-soft',
          )}
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{topic.name}</p>
          <p className={cn('mt-0.5 truncate text-xs', topic.voting === 'open' ? 'text-danger' : 'text-hint')}>{meta}</p>
        </div>
      </div>
      {canEdit && (
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move “${topic.name}” up`} className="rounded p-0.5 text-ink-soft hover:text-ink disabled:opacity-30">
            <ChevronUpIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move “${topic.name}” down`}
            className="rounded p-0.5 text-ink-soft hover:text-ink disabled:opacity-30"
          >
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
    <li className={cn('px-6 py-4', isWinner && 'bg-warning-soft/60')}>
      <div className="flex items-start gap-4">
        <span className="w-5 shrink-0 pt-0.5 text-right text-sm tabular-nums text-hint">{rank}</span>
        <div className="min-w-0 flex-1">
          {/* Name line carries the actions, so the description and bar get the full width. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[0.9375rem] font-medium text-ink">{pitch.innovatorName}</p>
              {isWinner && (
                <Tag tone="gold">
                  <TrophyIcon className="size-3" /> Winner
                </Tag>
              )}
              <span className="text-xs text-hint">
                {pitch.country} · {trackLabel(pitch.track, tracks)}
              </span>
            </div>
            {canEdit && (
              <div className="-mt-1 -mr-2 flex shrink-0">
                <Tooltip label="Edit">
                  <button
                    type="button"
                    onClick={onEdit}
                    aria-label={`Edit ${pitch.innovatorName}`}
                    className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}
                  >
                    <PencilSquareIcon className="size-4" />
                  </button>
                </Tooltip>
                <Tooltip label="Remove">
                  <button
                    type="button"
                    onClick={onDelete}
                    aria-label={`Remove ${pitch.innovatorName}`}

                    className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm leading-5 text-ink-soft">{pitch.description}</p>
          {counted && (
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', rank === 1 ? 'bg-primary' : 'bg-primary/35')} style={{ width: `${share}%` }} />
              </div>
              <span className="shrink-0 text-right text-sm tabular-nums text-ink-soft">
                {share}% <span className="text-hint">· {count(pitch.voteCount)}</span>
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
    <span className="flex items-center gap-1.5 text-xs text-hint">
      <span
        className={cn(
          'size-1.5 rounded-full',
          connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder',
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

type Pending =
  { kind: 'open'; topic: PitchTopic } | { kind: 'close'; topic: PitchTopic } | { kind: 'delete-topic'; topic: PitchTopic } | { kind: 'delete-pitch'; topic: PitchTopic; pitch: PitchEntry };

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
  const topicsRef = useListMotion<HTMLUListElement>();
  const pitchesRef = useListMotion<HTMLOListElement>();

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

  if (topics.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (topics.isError && !topics.data) {
    return <ErrorState framed title="The Pitchathon could not load" error={topics.error} onRetry={() => void topics.refetch()} />;
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
        {pending?.kind === 'delete-pitch' &&
          (pending.topic.voting === 'pending' ? 'The pitch is removed from the topic.' : `The pitch is removed, with the ${votes(pending.pitch.voteCount)} it received.`)}
      </ConfirmDialog>
    </>
  );

  if (all.length === 0) {
    return (
      <>
        <EmptyState
          framed
          icon={HandRaisedIcon}
          title="No topics yet"
          body="One topic per category: add its pitches, then open voting once they have presented."
          action={
            canEdit && (
              <button type="button" onClick={() => setTopicDialog({ name: null })} className={buttonClass()}>
                <PlusIcon className="size-4" />
                Create topic
              </button>
            )
          }
        />
        {dialogs}
      </>
    );
  }

  const ranked = selected ? (selected.voting === 'pending' ? selected.entries : standings(selected)) : [];
  const pct = shares(ranked.map((e) => e.voteCount));
  const won = new Set(selected ? winners(selected) : []);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Panel
        title="Topics"
        description="In running order."
        count={all.length}
        actions={
          canEdit && (
            <button type="button" onClick={() => setTopicDialog({ name: null })} className={buttonClass({ className: 'h-9' })}>
              <PlusIcon className="size-4" />
              New topic
            </button>
          )
        }
      >
        <ul ref={topicsRef} className="divide-y divide-border">
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
      </Panel>

      {selected && (
        <Panel
          title={selected.name}
          badge={<StatusPill topic={selected} />}
          actions={
            (selected.voting !== 'pending' || canEdit) && (
              <>
                {selected.voting !== 'pending' && (
                  <p className="text-sm tabular-nums text-ink" aria-live="polite">
                    <span className="text-2xl font-medium">{count(selected.voters)}</span> <span className="text-hint">{selected.voters === 1 ? 'vote' : 'votes'}</span>
                  </p>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setTopicDialog({ name: selected.name, id: selected.id })} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                    <PencilSquareIcon className="size-4" />
                    Rename
                  </button>
                )}
              </>
            )
          }
          footer={
            <>
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
                  {selected.voting === 'closed' && <span className="ml-2 text-xs text-hint">Result frozen{selected.closedAt ? ` at ${hm(selected.closedAt)}` : ''}</span>}
                </div>
              ) : (
                <span className="text-xs text-hint">Organisers run the Pitchathon; you can follow it here.</span>
              )}
            </>
          }
        >
          {ranked.length === 0 ? (
            <EmptyState
              icon={LightBulbIcon}
              title="No pitches in this topic yet"
              action={
                canEdit &&
                selected.voting === 'pending' && (
                  <button type="button" onClick={() => setPitchDialog({ pitch: null })} className={buttonClass()}>
                    <PlusIcon className="size-4" />
                    Add pitch
                  </button>
                )
              }
            />
          ) : (
            // keyed by topic, so picking another topic swaps the list rather than fading the old one out
            <ol key={selected.id} ref={pitchesRef} className="divide-y divide-border">
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

          {canEdit && selected.voting === 'pending' && ranked.length > 0 && (
            <div className="px-6 py-2">
              <button type="button" onClick={() => setPitchDialog({ pitch: null })} className={buttonClass({ style: 'borderless', color: 'gray', className: '-ml-3' })}>
                <PlusIcon className="size-4" />
                Add pitch
              </button>
            </div>
          )}
        </Panel>
      )}
      {dialogs}
    </div>
  );
}
