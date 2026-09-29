'use client';

import { CheckIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PlayIcon, StopIcon, TrophyIcon } from '@heroicons/react/24/solid';
import { useMemo, useState } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { TriviaDialog } from '@/components/trivia/trivia-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { count } from '@/lib/format';
import { shares } from '@/lib/polls/polls';
import { correctShare, EMPTY_DISTRIBUTION, OPTIONS, optionText, type TriviaForm, type TriviaQuestion, type TriviaStats } from '@/lib/trivia/trivia';
import { useTrivia, useTriviaActions } from '@/lib/trivia/use-trivia';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const answers = (n: number) => `${count(n)} ${n === 1 ? 'answer' : 'answers'}`;

/** Start (green play) or stop (red stop), the same control as Polls. */
function RunButton({ question, busy, onStart, onStop }: { question: TriviaQuestion; busy: boolean; onStart: () => void; onStop: () => void }) {
  const live = question.status === 'live';
  const label = live ? 'Stop and reveal' : question.status === 'closed' ? 'Run again' : 'Start question';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (live) onStop();
        else onStart();
      }}
      disabled={busy}
      aria-label={`${label}: ${question.text}`}
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

function ListItem({
  question,
  stats,
  selected,
  busy,
  onSelect,
  onStart,
  onStop,
}: {
  question: TriviaQuestion;
  stats: TriviaStats | null;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const played = stats?.playCount ?? 0;
  const right = stats ? correctShare(stats.distribution, question.correctOption) : null;
  const meta =
    question.status === 'live'
      ? `Live · ${answers(played)}`
      : question.status === 'closed'
        ? right === null
          ? 'Closed · nobody answered'
          : `${answers(played)} · ${right}% right`
        : 'Draft';
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className={cn('flex cursor-pointer items-center gap-3 border-l-2 px-4 py-3 transition-colors', selected ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]')}
      >
        <RunButton question={question} busy={busy} onStart={onStart} onStop={onStop} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-ink">{question.text}</p>
          <p className={cn('mt-0.5 text-xs', question.status === 'live' ? 'text-danger' : 'text-[#7c7c7c]')}>{meta}</p>
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

/** The selected question: its answers with how the room answered, the correct one marked. */
function Detail({
  question,
  stats,
  busy,
  onStart,
  onStop,
  onEdit,
  onDelete,
}: {
  question: TriviaQuestion;
  stats: TriviaStats | null;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const distribution = stats?.distribution ?? EMPTY_DISTRIBUTION;
  const played = stats?.playCount ?? 0;
  const pct = shares(OPTIONS.map((o) => distribution[o]));
  const right = correctShare(distribution, question.correctOption);
  const live = question.status === 'live';
  const counted = question.status !== 'draft';

  return (
    <section aria-labelledby="trivia-question" className={cn(cardClass, 'flex flex-col')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
            Live
          </span>
        ) : (
          <span className="text-xs text-[#7c7c7c]">{question.status === 'closed' ? 'Closed' : 'Draft'}</span>
        )}
        {counted && (
          <div className="flex items-baseline gap-5 text-sm tabular-nums" aria-live="polite">
            {right !== null && (
              <p>
                <span className="text-2xl font-medium text-ink">{right}%</span> <span className="text-[#7c7c7c]">right</span>
              </p>
            )}
            <p>
              <span className="text-2xl font-medium text-ink">{count(played)}</span> <span className="text-[#7c7c7c]">{played === 1 ? 'answer' : 'answers'}</span>
            </p>
          </div>
        )}
      </header>

      <div className="flex-1 px-6 py-6">
        <h2 id="trivia-question" className="text-xl leading-8 text-ink">
          {question.text}
        </h2>
        <ul className="mt-6 flex flex-col gap-3">
          {OPTIONS.map((o, i) => {
            const correct = question.correctOption === o;
            return (
              <li key={o} className={cn('rounded-lg border px-3 py-2.5', correct ? 'border-primary/40 bg-primary-soft/30' : 'border-border')}>
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium', correct ? 'bg-primary text-on-primary' : 'bg-[#f1f1f1] text-[#525252]')}
                    aria-hidden
                  >
                    {correct ? <CheckIcon className="size-3.5" /> : o}
                  </span>
                  <span className={cn('min-w-0 flex-1', correct ? 'font-medium text-ink' : 'text-[#525252]')}>
                    {optionText(question, o)}
                    {correct && <span className="sr-only"> (correct answer)</span>}
                  </span>
                  {counted && (
                    <span className="shrink-0 tabular-nums text-[#525252]">
                      {pct[i]}%<span className="ml-2 text-[#7c7c7c]">{count(distribution[o])}</span>
                    </span>
                  )}
                </div>
                {counted && (
                  <div className="mt-2 ml-9 h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]">
                    <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', correct ? 'bg-primary' : 'bg-[#bdbdbd]')} style={{ width: `${pct[i]}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {question.explanation && (
          <div className="mt-5 rounded-lg bg-[#f6f6f6] px-4 py-3">
            <p className="text-xs text-[#7c7c7c]">Shown with the answer</p>
            <p className="mt-0.5 text-sm text-[#525252]">{question.explanation}</p>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#f6f6f6] px-6 py-3">
        <ConnectionDot />
        <div className="flex items-center gap-1">
          {question.status !== 'closed' && (
            <button type="button" onClick={onEdit} className={buttonClass({ style: 'borderless', color: 'gray' })}>
              <PencilSquareIcon className="size-4" />
              Edit
            </button>
          )}
          <button type="button" onClick={onDelete} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
            <TrashIcon className="size-4" />
            Delete
          </button>
          <button type="button" onClick={live ? onStop : onStart} disabled={busy} className={buttonClass({ color: live ? 'danger' : 'primary', className: 'ml-2' })}>
            {live ? <StopIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {live ? 'Stop and reveal answer' : question.status === 'closed' ? 'Run again' : 'Start question'}
          </button>
        </div>
      </footer>
    </section>
  );
}

type Pending = { kind: 'start'; question: TriviaQuestion } | { kind: 'delete'; question: TriviaQuestion };

/** Trivia for one event: its questions, and the one live on delegates' phones. */
export default function TriviaPage() {
  const page = usePageEdition();
  return <EventBar page={page}>{(editionId) => <TriviaBoard editionId={editionId} />}</EventBar>;
}

function TriviaBoard({ editionId }: { editionId: string }) {
  const { list, statsFor } = useTrivia(editionId);
  const { save, start, stop, remove } = useTriviaActions(editionId);
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ question: TriviaQuestion | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const live = all.find((q) => q.status === 'live') ?? null;
  const selected = all.find((q) => q.id === picked) ?? live ?? all[0] ?? null;
  const busy = start.isPending || stop.isPending;
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: StopIcon, tone: 'danger' } });

  const run = (q: TriviaQuestion) =>
    start.mutate(
      { id: q.id },
      {
        onSuccess: () => {
          setPending(null);
          setPicked(q.id);
        },
        onError: fail('Question not started'),
      },
    );
  // Starting one closes whatever is live (and reveals its answer), so that is confirmed first.
  const requestStart = (q: TriviaQuestion) => (live && live.id !== q.id ? setPending({ kind: 'start', question: q }) : run(q));
  const end = (q: TriviaQuestion) => stop.mutate({ id: q.id }, { onError: fail('Question not stopped') });

  if (list.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (list.isError && !list.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Trivia could not load.</p>
        <p className="mt-1 text-sm text-muted">{list.error.message}</p>
        <button type="button" onClick={() => void list.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  const dialogs = (
    <>
      <TriviaDialog
        open={!!editing}
        question={editing?.question ?? null}
        pending={save.isPending}
        error={save.error?.message ?? null}
        onSave={(body: TriviaForm) =>
          save.mutate(
            { id: editing?.question?.id, body },
            {
              onSuccess: (saved) => {
                setEditing(null);
                save.reset();
                setPicked(saved.id);
              },
            },
          )
        }
        onClose={() => {
          setEditing(null);
          save.reset();
        }}
      />
      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'start' ? 'Start this question?' : 'Delete this question?'}
        confirmLabel={pending?.kind === 'start' ? 'Start question' : 'Delete question'}
        pendingLabel={pending?.kind === 'start' ? 'Starting…' : 'Deleting…'}
        pending={start.isPending || remove.isPending}
        tone={pending?.kind === 'delete' ? 'danger' : 'default'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'start') run(pending.question);
          else
            remove.mutate(
              { id: pending.question.id },
              {
                onSuccess: () => {
                  setPending(null);
                  setPicked(null);
                },
                onError: fail('Question not deleted'),
              },
            );
        }}
      >
        {pending?.kind === 'start'
          ? `“${live?.text}” is live. Starting this one stops it and reveals its answer.`
          : pending?.question.status === 'draft'
            ? `“${pending.question.text}” is deleted.`
            : `“${pending?.question.text}” is deleted with every answer given to it.`}
      </ConfirmDialog>
    </>
  );

  if (all.length === 0) {
    return (
      <>
        <div className={cn(cardClass, 'mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-6 py-16 text-center')}>
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <TrophyIcon className="size-6" />
          </span>
          <div>
            <p className="font-medium text-ink">No trivia questions yet</p>
            <p className="mt-1 max-w-md text-sm text-[#7c7c7c]">Write a few for the breaks, then start each one here. Delegates answer on their phones and see the answer when you stop it.</p>
          </div>
          <button type="button" onClick={() => setEditing({ question: null })} className={buttonClass()}>
            <PlusIcon className="size-4" />
            Add question
          </button>
        </div>
        {dialogs}
      </>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-label="All questions" className={cardClass}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm text-[#525252]">
            {all.length} {all.length === 1 ? 'question' : 'questions'}
          </p>
          <button type="button" onClick={() => setEditing({ question: null })} className={buttonClass({ className: 'h-9' })}>
            <PlusIcon className="size-4" />
            New question
          </button>
        </header>
        <ul className="max-h-[calc(100dvh-16rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
          {all.map((q) => (
            <ListItem
              key={q.id}
              question={q}
              stats={statsFor(q.id)}
              selected={q.id === selected?.id}
              busy={busy}
              onSelect={() => setPicked(q.id)}
              onStart={() => requestStart(q)}
              onStop={() => end(q)}
            />
          ))}
        </ul>
      </section>

      {selected && (
        <Detail
          question={selected}
          stats={statsFor(selected.id)}
          busy={busy}
          onStart={() => requestStart(selected)}
          onStop={() => end(selected)}
          onEdit={() => setEditing({ question: selected })}
          onDelete={() => setPending({ kind: 'delete', question: selected })}
        />
      )}
      {dialogs}
    </div>
  );
}
