'use client';

import { ArrowRightCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { applyAgendaFix, type AgendaFix } from '@/lib/captions/agenda-check';
import { clock } from '@/lib/format';
import { prepareDay, type PrepProgress, type PrepResult, type PrepStep } from '@/lib/programme/prepare-day';
import type { Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

const STEPS: { step: PrepStep; label: string }[] = [
  { step: 'agenda', label: 'Check each room against the agenda, moving clear mix-ups' },
  { step: 'names', label: 'Name the speakers in every finished session' },
  { step: 'analyse', label: 'Analyse the moved sessions again' },
  { step: 'who', label: 'Find who said each call to action' },
];

/**
 * One click for the end of a day: the agenda check (clear mix-ups moved, the rest listed), speaker
 * names, the moved sessions analysed afresh, and each call's speaker found. Then the day's calls
 * are reviewed and the report and deck downloaded from Calls to action.
 */
export function PrepareDayDialog({ open, day, editionId, sessions, onClose }: { open: boolean; day: number; editionId: string; sessions: Session[]; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const [progress, setProgress] = useState<PrepProgress | null>(null);
  const [result, setResult] = useState<PrepResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movedNow, setMovedNow] = useState<Set<string>>(new Set());
  const running = progress !== null && !result && !error;
  const titleOf = (id: string | null) => (id ? (sessions.find((s) => s.id === id)?.title ?? 'another session') : 'no session');
  const stepIndex = progress ? STEPS.findIndex((s) => s.step === progress.step) : -1;

  const run = () => {
    setError(null);
    setResult(null);
    setProgress({ step: 'agenda', done: 0, of: 0 });
    prepareDay(editionId, day, sessions, setProgress)
      .then((r) => {
        setResult(r);
        void queryClient.invalidateQueries();
      })
      .catch((e: Error) => setError(e.message));
  };

  const keyOf = (f: AgendaFix) => `${f.fromSessionId}:${f.since}`;
  const move = (f: AgendaFix) =>
    applyAgendaFix(f)
      .then(({ moved }) => {
        setMovedNow((m) => new Set(m).add(keyOf(f)));
        void queryClient.invalidateQueries();
        toast.push({ title: 'Moved', body: `${moved} line(s) now under “${titleOf(f.toSessionId)}”. Analyse it again with “Read the whole session again”.` });
      })
      .catch((e: Error) => toast.push({ title: 'Not moved', body: e.message }));

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!running) onClose();
      }}
      className={modalClass('lg')}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={SparklesIcon} title={`Prepare day ${day}`} titleId={titleId} subtitle="The day’s wrap-up in one go, before the report and the deck" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-3 scrollbar-thin">
          <ol className="flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const doneStep = result !== null || i < stepIndex;
              const current = !result && i === stepIndex;
              return (
                <li key={s.step} className={cn('flex items-center gap-3 text-sm', doneStep ? 'text-ink' : current ? 'font-medium text-ink' : 'text-hint')}>
                  {doneStep ? <CheckCircleIcon className="size-5 text-success" /> : <span className={cn('flex size-5 items-center justify-center rounded-full border text-xs', current ? 'border-primary text-primary' : 'border-border')}>{i + 1}</span>}
                  {s.label}
                  {current && progress && progress.of > 0 && <span className="text-hint">· {progress.done} of {progress.of}</span>}
                </li>
              );
            })}
          </ol>

          {!progress && (
            <p className="text-sm text-ink-soft">
              Takes ten to twenty minutes for a full day; keep this window open. Stretches the AI is at least 90% sure were filed under the wrong session are moved on their own; anything less certain is listed here for you.
            </p>
          )}
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          {result && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1 rounded-xl border border-border p-4 text-sm text-ink">
                <li>
                  {result.moved.length} stretch{result.moved.length === 1 ? '' : 'es'} moved to the right session ({result.moved.reduce((n, m) => n + m.lines, 0)} lines)
                </li>
                <li>{result.namesAdded} speaker name(s) added</li>
                <li>
                  {result.reanalysed} session(s) analysed again: {result.newSuggestions} new suggestion(s) to review
                </li>
                <li>{result.speakersFilled} call(s) to action given who said them</li>
                {(result.roomsFailed.length > 0 || result.failures > 0) && (
                  <li className="text-warning">
                    {result.roomsFailed.length ? `Not checked: ${result.roomsFailed.join(', ')}. ` : ''}
                    {result.failures ? `${result.failures} step(s) could not finish; running Prepare again picks them up.` : ''}
                  </li>
                )}
              </ul>

              {result.moved.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-soft">What was moved</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {result.moved.map(({ fix }) => (
                      <li key={keyOf(fix)} className="text-ink-soft">
                        {clock(fix.since)}–{clock(fix.until)}: “{titleOf(fix.fromSessionId)}” → “{titleOf(fix.toSessionId)}” · {fix.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {result.toReview.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="font-medium text-ink">For you to decide ({result.toReview.length})</h3>
                  {result.toReview.map((f) => {
                    const done = movedNow.has(keyOf(f));
                    return (
                      <div key={keyOf(f)} className={cn('rounded-lg border p-3 text-sm', done ? 'border-border opacity-60' : 'border-warning/50 bg-warning-soft/30')}>
                        <p className="flex items-start gap-2 text-ink">
                          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                          <span>
                            {clock(f.since)}–{clock(f.until)} under <strong>“{titleOf(f.fromSessionId)}”</strong> may belong to <strong>{f.toSessionId ? `“${titleOf(f.toSessionId)}”` : 'no session'}</strong>. {f.why}
                          </span>
                        </p>
                        <p className="mt-1 text-ink-soft">{f.reason}</p>
                        <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs italic text-ink-soft">“{f.evidence}”</blockquote>
                        {f.toSessionId && (
                          <button type="button" disabled={done} onClick={() => void move(f)} className={buttonClass({ className: 'mt-2 h-8' })}>
                            <ArrowRightCircleIcon className="size-4" />
                            {done ? 'Moved' : 'Move'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              <p className="text-sm text-ink-soft">
                Next: review the new suggestions, then download the end of day report and the deck, all on <Link href="/calls-to-action" className="font-medium text-primary underline underline-offset-2">Calls to action</Link>.
              </p>
            </div>
          )}
        </div>
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={onClose} disabled={running} className={cancelClass}>
            {running ? 'Working…' : 'Close'}
          </button>
          {!result && (
            <button type="button" onClick={run} disabled={running} className={buttonClass()}>
              <SparklesIcon className="size-4" />
              {running ? 'Preparing…' : `Prepare day ${day}`}
            </button>
          )}
        </ModalActions>
      </div>
    </dialog>
  );
}
