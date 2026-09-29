'use client';

import { ChartBarIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Session } from '@/lib/programme/programme';
import { emptyPoll, MAX_OPTIONS, MIN_OPTIONS, pollFormOf, pollSchema, type Poll, type PollForm } from '@/lib/polls/polls';
import type { PollBody } from '@/lib/polls/use-polls';
import { cn } from '@/lib/utils';

type Errors = { question?: string; options?: Record<number, string>; list?: string };
const NO_SESSION = '__none__';

/**
 * Drafts a poll, or edits a draft. "Save and start" runs it straight away; when another poll is
 * live the dialog says that one will stop.
 */
export function PollDialog({
  open,
  poll,
  sessions,
  onAir,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The draft being edited, or null for a new poll. */
  poll: Poll | null;
  sessions: Session[];
  /** The poll open right now, if any (it closes when this one opens). */
  onAir: Poll | null;
  pending: boolean;
  error: string | null;
  onSave: (body: PollBody, thenOpen: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const [form, setForm] = useState<PollForm>(emptyPoll);
  const [errors, setErrors] = useState<Errors>({});
  const [openedFor, setOpenedFor] = useState<Poll | null | undefined>(undefined);

  // Each opening starts from the poll it was opened for.
  if (open && openedFor !== poll) {
    setOpenedFor(poll);
    setForm(poll ? pollFormOf(poll) : emptyPoll());
    setErrors({});
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (pending) return;
    setOpenedFor(undefined);
    onClose();
  };

  const setOption = (i: number, value: string) => {
    setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? value : o)) }));
    if (errors.options?.[i]) setErrors((e) => ({ ...e, options: { ...e.options, [i]: '' } }));
  };
  const addOption = () => {
    setForm((f) => ({ ...f, options: [...f.options, ''] }));
    requestAnimationFrame(() => document.getElementById(id(`option-${form.options.length}`))?.focus());
  };
  const removeOption = (i: number) => {
    setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }));
    setErrors((e) => ({ ...e, options: {} }));
  };

  const submit = (thenOpen: boolean) => (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const parsed = pollSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = { options: {} };
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'question') next.question ??= issue.message;
        else if (issue.path[0] === 'options' && typeof issue.path[1] === 'number') next.options![issue.path[1]] ??= issue.message;
        else if (issue.path[0] === 'options') next.list ??= issue.message;
      }
      setErrors(next);
      return;
    }
    onSave(parsed.data, thenOpen);
  };

  const sessionOptions = [
    { value: NO_SESSION, label: 'Not tied to a session' },
    ...sessions.filter((s) => s.type !== 'break').map((s) => ({ value: s.id, label: `Day ${s.day} · ${s.room} · ${s.title}` })),
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('title')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('md')}
    >
      <form onSubmit={submit(false)} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={ChartBarIcon} title={poll ? 'Edit poll' : 'New poll'} titleId={id('title')} subtitle="Delegates answer on their phones while it runs." />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-3 scrollbar-thin">
          {/* Question */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor={id('question')} className="text-sm font-medium text-ink">
                Question
              </label>
              <span className={cn('text-xs tabular-nums', form.question.trim().length > 180 ? 'text-[#7a5d00]' : 'text-[#7c7c7c]')}>{form.question.trim().length}/200</span>
            </div>
            <textarea
              id={id('question')}
              rows={2}
              value={form.question}
              onChange={(e) => {
                setForm((f) => ({ ...f, question: e.target.value }));
                if (errors.question) setErrors((x) => ({ ...x, question: undefined }));
              }}
              placeholder="Which barrier holds women-led businesses back most?"
              maxLength={200}
              aria-invalid={!!errors.question}
              aria-describedby={errors.question ? id('question-error') : undefined}
              autoFocus
              className={cn(
                'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-[15px] leading-6 text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                errors.question ? 'border-danger' : 'border-[#bdbdbd]',
              )}
            />
            {errors.question && (
              <p id={id('question-error')} className="mt-1 text-xs text-danger">
                {errors.question}
              </p>
            )}
          </div>

          {/* Answers */}
          <fieldset>
            <div className="mb-1.5 flex items-baseline justify-between">
              <legend className="text-sm font-medium text-ink">Answers</legend>
              <span className="text-xs text-[#7c7c7c]">
                {MIN_OPTIONS}–{MAX_OPTIONS}
              </span>
            </div>
            <ol className="flex flex-col gap-2">
              {form.options.map((option, i) => {
                const optionError = errors.options?.[i];
                return (
                  <li key={i}>
                    <div
                      className={cn(
                        'flex items-center rounded-lg border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                        optionError ? 'border-danger' : 'border-[#bdbdbd]',
                      )}
                    >
                      <span className="flex h-10 w-9 shrink-0 items-center justify-center border-r border-border text-xs tabular-nums text-[#7c7c7c]" aria-hidden>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        id={id(`option-${i}`)}
                        value={option}
                        onChange={(e) => setOption(i, e.target.value)}
                        onKeyDown={(e) => {
                          // Enter on the last answer adds the next one, as in most poll tools.
                          if (e.key === 'Enter' && i === form.options.length - 1 && form.options.length < MAX_OPTIONS) {
                            e.preventDefault();
                            addOption();
                          }
                        }}
                        placeholder={`Answer ${String.fromCharCode(65 + i)}`}
                        aria-label={`Answer ${i + 1}`}
                        aria-invalid={!!optionError}
                        maxLength={100}
                        className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-placeholder"
                      />
                      {form.options.length > MIN_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => removeOption(i)}
                          aria-label={`Remove answer ${i + 1}`}
                          className="mr-1 flex size-8 items-center justify-center rounded-md text-[#7c7c7c] hover:bg-[#f1f1f1] hover:text-ink"
                        >
                          <XMarkIcon className="size-4" />
                        </button>
                      )}
                    </div>
                    {optionError && <p className="mt-1 text-xs text-danger">{optionError}</p>}
                  </li>
                );
              })}
            </ol>
            {form.options.length < MAX_OPTIONS && (
              <button type="button" onClick={addOption} className={buttonClass({ style: 'borderless', color: 'gray', className: '-ml-3 mt-1' })}>
                <PlusIcon className="size-4" />
                Add an answer
              </button>
            )}
            {errors.list && <p className="mt-1 text-xs text-danger">{errors.list}</p>}
          </fieldset>

          {/* Settings */}
          <div className="divide-y divide-border rounded-lg border border-border">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <label htmlFor={id('session')} className="text-sm text-ink">
                  Session
                </label>
                <p className="text-xs text-[#7c7c7c]">For your records.</p>
              </div>
              <Select
                id={id('session')}
                value={form.sessionId ?? NO_SESSION}
                options={sessionOptions}
                onChange={(value) => setForm((f) => ({ ...f, sessionId: value === NO_SESSION ? null : value }))}
                className="w-full sm:w-64"
              />
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div id={id('results')} className="min-w-0">
                <p className="text-sm text-ink">Show results while it runs</p>
                <p className="text-xs text-[#7c7c7c]">Off for a guess, so an early lead does not sway the room.</p>
              </div>
              <Switch checked={form.showResults} onChange={(showResults) => setForm((f) => ({ ...f, showResults }))} labelledBy={id('results')} />
            </div>
          </div>

          {onAir && onAir.id !== poll?.id && (
            <p className="rounded-lg bg-[#fdf6e0] px-3 py-2 text-xs text-[#7a5d00]">“{onAir.question}” is live. Starting this poll stops it and shows its results.</p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass({ style: 'outline', color: 'gray' })}>
            Save as draft
          </button>
          <button type="button" onClick={() => submit(true)()} disabled={pending} className={buttonClass()}>
            <PlayIcon className="size-4" />
            {pending ? 'Saving…' : 'Save and start'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
