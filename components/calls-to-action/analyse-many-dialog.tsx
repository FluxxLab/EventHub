'use client';

import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useMemo, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Spinner } from '@/components/ui/spinner';
import { AT_ONCE, type RunState } from '@/lib/calls-to-action/analyse-queue';
import { timeRange, type Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

/** A session's run, as one calm line: waiting, reading, what it found, or why it stopped. */
function RunLine({ state }: { state: RunState }) {
  if (state.status === 'waiting')
    return (
      <span className="inline-flex items-center gap-1.5 text-hint">
        <ClockIcon className="size-4" aria-hidden />
        Waiting
      </span>
    );
  if (state.status === 'reading')
    return (
      <span className="inline-flex items-center gap-1.5 text-primary">
        <Spinner className="size-4" />
        {state.retry ? 'The AI was busy: trying again' : 'Reading the transcript'}
      </span>
    );
  if (state.status === 'done')
    return (
      <span className={cn('pop-in inline-flex items-center gap-1.5', state.added ? 'text-success' : 'text-ink-soft')}>
        <CheckCircleIcon className="size-4" aria-hidden />
        {state.added ? `${state.added} suggested` : 'Nothing new'}
      </span>
    );
  return (
    <span className="pop-in inline-flex items-start gap-1.5 text-danger">
      <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {state.message}
    </span>
  );
}

/**
 * Analyse several sessions in one go: tick them (or pick a day's ended sessions), then each is
 * read in turn, two at a time, with its progress on its own line. The dialog can be hidden while
 * it works; the calls appear in the list below as each session finishes.
 */
export function AnalyseManyDialog({
  open,
  sessions,
  analysedTimes,
  queue,
  onReview,
  onClose,
}: {
  open: boolean;
  /** The event's sessions in running order (breaks left out). */
  sessions: Session[];
  /** How many times a session has been analysed, for the list. */
  analysedTimes: (sessionId: string) => number;
  queue: { runs: Record<string, RunState>; running: boolean; start: (ids: string[], fromStart: boolean) => Promise<void>; clear: () => void };
  /** Shows what was suggested (the To review tab). */
  onReview: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [fromStart, setFromStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = Object.keys(queue.runs).length > 0;
  const finished = started && !queue.running;
  const ended = useMemo(() => sessions.filter((s) => s.status === 'completed' || s.status === 'live'), [sessions]);
  const days = useMemo(() => [...new Set(ended.map((s) => s.day))].sort((a, b) => a - b), [ended]);
  const runs = Object.entries(queue.runs);
  const found = runs.reduce((n, [, r]) => n + (r.status === 'done' ? r.added : 0), 0);
  const failed = runs.filter(([, r]) => r.status === 'failed').length;

  const toggle = (id: string) => setPicked((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (finished) {
      if (found) onReview();
      queue.clear();
      return onClose();
    }
    if (started) return onClose(); // hidden while it works; it carries on
    if (!picked.length) return setError('Tick at least one session.');
    setError(null);
    // in running order, whatever order they were ticked in
    void queue.start(
      sessions.filter((s) => picked.includes(s.id)).map((s) => s.id),
      fromStart,
    );
  };
  const close = () => {
    if (finished) queue.clear();
    onClose();
  };

  return (
    <FormDialog
      open={open}
      icon={SparklesIcon}
      title="Analyse several sessions"
      subtitle={`Each session is read in turn, ${AT_ONCE} at a time, so the AI is not asked for too much at once. You can hide this while it works.`}
      pending={false}
      submitLabel={
        finished ? (found ? 'Review suggestions' : 'Done') : started ? 'Hide while it works' : picked.length ? `Analyse ${picked.length} ${picked.length === 1 ? 'session' : 'sessions'}` : 'Analyse'
      }
      error={started ? null : error}
      onSubmit={submit}
      onClose={close}
    >
      {started ? (
        <div className="flex flex-col gap-3">
          {finished && (
            <p role="status" className="text-sm text-ink">
              {found ? `${found} ${found === 1 ? 'call to action' : 'calls to action'} suggested` : 'No new calls to action'} from {runs.length} {runs.length === 1 ? 'session' : 'sessions'}
              {failed ? `; ${failed} could not be analysed.` : '.'}
            </p>
          )}
          <ul aria-live="polite" className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {runs.map(([id, state]) => {
              const s = sessions.find((x) => x.id === id);
              return (
                <li key={id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="min-w-0 truncate text-ink">{s ? `Day ${s.day} · ${timeRange(s.startsAt, s.endsAt)} · ${s.title}` : 'A session'}</span>
                  <span className="shrink-0 text-sm">
                    <RunLine state={state} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {days.map((d) => (
              <button key={d} type="button" onClick={() => setPicked(ended.filter((s) => s.day === d).map((s) => s.id))} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
                Day {d}’s sessions
              </button>
            ))}
            {picked.length > 0 && (
              <button type="button" onClick={() => setPicked([])} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
                Clear
              </button>
            )}
          </div>
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {sessions.map((s) => {
              const times = analysedTimes(s.id);
              const upcoming = s.status !== 'completed' && s.status !== 'live';
              return (
                <li key={s.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-soft', upcoming && 'text-hint')}>
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} className="size-4 shrink-0 accent-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      Day {s.day} · {timeRange(s.startsAt, s.endsAt)} · {s.title}
                    </span>
                    <span className="shrink-0 text-xs text-hint">{s.status === 'live' ? 'Live' : upcoming ? 'Not started' : times ? `Analysed ${times}×` : 'Not analysed'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <label className="flex w-fit items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={fromStart} onChange={(e) => setFromStart(e.target.checked)} className="size-4 accent-primary" />
            Read the whole sessions again
            <span className="text-hint">· calls already listed are not suggested twice</span>
          </label>
        </div>
      )}
    </FormDialog>
  );
}
