'use client';

import { ChartBarIcon, EyeSlashIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { useMemo, useState } from 'react';

import { PollDialog } from '@/components/polls/poll-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { useEditions } from '@/lib/events/use-editions';
import { ago, count } from '@/lib/format';
import { elapsed, leaders, shares, type Poll } from '@/lib/polls/polls';
import { usePollActions, usePolls, type PollBody } from '@/lib/polls/use-polls';
import type { Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const votes = (n: number) => `${count(n)} ${n === 1 ? 'vote' : 'votes'}`;

/** Each answer with its share: the leader in brand blue, the rest lighter. */
function ResultBars({ poll }: { poll: Poll }) {
  const counts = poll.counts ?? poll.options.map(() => 0);
  const pct = shares(counts);
  const lead = new Set(leaders(counts));
  return (
    <ul className="flex flex-col gap-4">
      {poll.options.map((option, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn('min-w-0', lead.has(i) ? 'font-medium text-ink' : 'text-[#525252]')}>{option}</span>
            <span className="shrink-0 tabular-nums text-[#525252]">
              {pct[i]}%<span className="ml-2 text-[#7c7c7c]">{count(counts[i] ?? 0)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#f1f1f1]">
            <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', lead.has(i) ? 'bg-primary' : 'bg-primary/35')} style={{ width: `${pct[i]}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Start (green play) or stop (red stop), as hosts know it from Slido and Mentimeter. */
function RunButton({ poll, busy, onStart, onStop, size = 'sm' }: { poll: Poll; busy: boolean; onStart: () => void; onStop: () => void; size?: 'sm' | 'lg' }) {
  const live = poll.status === 'open';
  const label = live ? 'Stop poll' : poll.status === 'closed' ? 'Run again' : 'Start poll';
  if (size === 'lg') {
    return (
      <button type="button" onClick={live ? onStop : onStart} disabled={busy} className={buttonClass({ color: live ? 'danger' : 'primary' })}>
        {live ? <StopIcon className="size-4" /> : <PlayIcon className="size-4" />}
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (live) onStop();
        else onStart();
      }}
      disabled={busy}
      aria-label={`${label}: ${poll.question}`}
      title={label}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-on-primary transition-colors disabled:opacity-50',
        live ? 'bg-danger hover:bg-danger/90' : 'bg-success hover:bg-success/90',
      )}
    >
      {live ? <StopIcon className="size-3.5" /> : <PlayIcon className="ml-0.5 size-3.5" />}
    </button>
  );
}

function ListItem({ poll, selected, busy, onSelect, onStart, onStop }: { poll: Poll; selected: boolean; busy: boolean; onSelect: () => void; onStart: () => void; onStop: () => void }) {
  const meta =
    poll.status === 'open' ? `Live · ${votes(poll.total)}` : poll.status === 'closed' ? votes(poll.total) : `Draft · ${poll.options.length} answers`;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className={cn(
          'flex cursor-pointer items-center gap-3 border-l-2 px-4 py-3 transition-colors',
          selected ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]',
        )}
      >
        <RunButton poll={poll} busy={busy} onStart={onStart} onStop={onStop} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-ink">{poll.question}</p>
          <p className={cn('mt-0.5 text-xs', poll.status === 'open' ? 'text-danger' : 'text-[#7c7c7c]')}>{meta}</p>
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

/** The selected poll: its question, answers and results, and what can be done with it. */
function Detail({
  poll,
  session,
  now,
  busy,
  onStart,
  onStop,
  onEdit,
  onDelete,
}: {
  poll: Poll;
  session?: Session;
  now: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status =
    poll.status === 'open' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
        Live · {elapsed(poll.openedAt, now)}
      </span>
    ) : (
      <span className="text-xs text-[#7c7c7c]">{poll.status === 'closed' ? `Closed ${poll.closedAt ? ago(poll.closedAt, now).toLowerCase() : ''}` : 'Draft'}</span>
    );
  return (
    <section aria-labelledby="poll-question" className={cn(cardClass, 'flex flex-col')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {status}
          {session && <span className="text-xs text-[#7c7c7c]">{session.title}</span>}
          {!poll.showResults && poll.status !== 'closed' && (
            <span className="inline-flex items-center gap-1 text-xs text-[#7a5d00]">
              <EyeSlashIcon className="size-3.5" /> Hidden from delegates until stopped
            </span>
          )}
        </div>
        {poll.status !== 'draft' && (
          <p className="text-sm tabular-nums text-ink" aria-live="polite">
            <span className="text-2xl font-medium">{count(poll.total)}</span> <span className="text-[#7c7c7c]">{poll.total === 1 ? 'vote' : 'votes'}</span>
          </p>
        )}
      </header>

      <div className="flex-1 px-6 py-6">
        <h2 id="poll-question" className="text-xl leading-8 text-ink">
          {poll.question}
        </h2>
        <div className="mt-6">
          {poll.status === 'draft' ? (
            <ol className="flex flex-col gap-2">
              {poll.options.map((o, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm text-ink">
                  <span className="w-4 text-right tabular-nums text-[#7c7c7c]">{i + 1}</span>
                  {o}
                </li>
              ))}
            </ol>
          ) : (
            <ResultBars poll={poll} />
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#f6f6f6] px-6 py-3">
        <ConnectionDot />
        <div className="flex items-center gap-1">
          {poll.status === 'draft' && (
            <button type="button" onClick={onEdit} className={buttonClass({ style: 'borderless', color: 'gray' })}>
              <PencilSquareIcon className="size-4" />
              Edit
            </button>
          )}
          <button type="button" onClick={onDelete} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
            <TrashIcon className="size-4" />
            Delete
          </button>
          <span className="ml-2">
            <RunButton poll={poll} busy={busy} onStart={onStart} onStop={onStop} size="lg" />
          </span>
        </div>
      </footer>
    </section>
  );
}

type Pending = { kind: 'start'; poll: Poll } | { kind: 'delete'; poll: Poll };

export default function PollsPage() {
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const polls = usePolls(edition?.id);
  const sessions = useSessions(edition?.id);
  const { save, open, close, remove } = usePollActions(edition?.id);
  const toast = useToast();
  const now = useNow(1_000).getTime();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ poll: Poll | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const all = useMemo(() => polls.data ?? [], [polls.data]);
  const live = all.find((p) => p.status === 'open') ?? null;
  // The live poll is what the host is watching, so it is shown until another is picked.
  const selected = all.find((p) => p.id === picked) ?? live ?? all[0] ?? null;
  const sessionOf = (p: Poll) => sessions.data?.find((s) => s.id === p.sessionId);
  const busy = open.isPending || close.isPending;
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: StopIcon, tone: 'danger' } });

  const start = (poll: Poll) =>
    open.mutate(
      { id: poll.id },
      {
        onSuccess: () => {
          setPending(null);
          setPicked(poll.id);
        },
        onError: fail('Poll not started'),
      },
    );
  // Starting one stops whatever is live, so that case is confirmed first.
  const requestStart = (poll: Poll) => (live && live.id !== poll.id ? setPending({ kind: 'start', poll }) : start(poll));
  const stop = (poll: Poll) => close.mutate({ id: poll.id }, { onError: fail('Poll not stopped') });

  const onSave = (body: PollBody, thenOpen: boolean) =>
    save.mutate(
      { id: editing?.poll?.id, body },
      {
        onSuccess: (saved) => {
          setEditing(null);
          save.reset();
          setPicked(saved.id);
          if (thenOpen) requestStart(saved);
        },
      },
    );

  if (editions.isPending || polls.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (polls.isError && !polls.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Polls could not load.</p>
        <p className="mt-1 text-sm text-muted">{polls.error.message}</p>
        <button type="button" onClick={() => void polls.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  const dialogs = (
    <>
      <PollDialog
        open={!!editing}
        poll={editing?.poll ?? null}
        sessions={sessions.data ?? []}
        onAir={live}
        pending={save.isPending || open.isPending}
        error={save.error?.message ?? null}
        onSave={onSave}
        onClose={() => {
          setEditing(null);
          save.reset();
        }}
      />
      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'start' ? `Start “${pending.poll.question}”?` : `Delete “${pending?.poll.question ?? ''}”?`}
        confirmLabel={pending?.kind === 'start' ? 'Start poll' : 'Delete poll'}
        pendingLabel={pending?.kind === 'start' ? 'Starting…' : 'Deleting…'}
        pending={open.isPending || remove.isPending}
        tone={pending?.kind === 'delete' ? 'danger' : 'default'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'start') start(pending.poll);
          else
            remove.mutate(
              { id: pending.poll.id },
              {
                onSuccess: () => {
                  setPending(null);
                  setPicked(null);
                },
                onError: fail('Poll not deleted'),
              },
            );
        }}
      >
        {pending?.kind === 'start'
          ? `“${live?.question}” is live. Starting this one stops it and shows its results.`
          : pending?.poll.status === 'draft'
            ? 'The draft is deleted.'
            : `The poll and its ${votes(pending?.poll.total ?? 0)} are deleted, and it disappears from the app.`}
      </ConfirmDialog>
    </>
  );

  if (all.length === 0) {
    return (
      <>
      <div className={cn(cardClass, 'mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-6 py-16 text-center')}>
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ChartBarIcon className="size-6" />
        </span>
        <div>
          <p className="font-medium text-ink">No polls yet</p>
          <p className="mt-1 text-sm text-[#7c7c7c]">Write them before the session, then start each one from here when the stage is ready.</p>
        </div>
        <button type="button" onClick={() => setEditing({ poll: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          Create poll
        </button>
      </div>
      {/* Outside the centred card, so the dialog does not inherit its centring. */}
      {dialogs}
      </>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-label="All polls" className={cardClass}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm text-[#525252]">
            {all.length} {all.length === 1 ? 'poll' : 'polls'}
          </p>
          <button type="button" onClick={() => setEditing({ poll: null })} className={buttonClass({ className: 'h-9' })}>
            <PlusIcon className="size-4" />
            New poll
          </button>
        </header>
        <ul className="max-h-[calc(100dvh-16rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
          {all.map((p) => (
            <ListItem
              key={p.id}
              poll={p}
              selected={p.id === selected?.id}
              busy={busy}
              onSelect={() => setPicked(p.id)}
              onStart={() => requestStart(p)}
              onStop={() => stop(p)}
            />
          ))}
        </ul>
      </section>

      {selected && (
        <Detail
          poll={selected}
          session={sessionOf(selected)}
          now={now}
          busy={busy}
          onStart={() => requestStart(selected)}
          onStop={() => stop(selected)}
          onEdit={() => setEditing({ poll: selected })}
          onDelete={() => setPending({ kind: 'delete', poll: selected })}
        />
      )}
      {dialogs}
    </div>
  );
}
