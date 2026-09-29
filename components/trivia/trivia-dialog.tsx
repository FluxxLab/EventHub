'use client';

import { CheckIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useId, useState } from 'react';

import { FormDialog } from '@/components/ui/form-dialog';
import { emptyTrivia, OPTIONS, triviaFormOf, triviaSchema, type TriviaForm, type TriviaOption, type TriviaQuestion } from '@/lib/trivia/trivia';
import { cn } from '@/lib/utils';

type Errors = Partial<Record<keyof TriviaForm, string>>;

const textareaClass = (invalid: boolean) =>
  cn(
    'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm leading-5 text-ink shadow-xs outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
    invalid ? 'border-danger' : 'border-[#bdbdbd]',
  );

/**
 * Write a trivia question, or edit one. Four answers, one marked correct by its letter; the
 * explanation is shown to delegates when the question closes.
 */
export function TriviaDialog({
  open,
  question,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  question: TriviaQuestion | null;
  pending: boolean;
  error: string | null;
  onSave: (form: TriviaForm) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const [form, setForm] = useState<TriviaForm>(emptyTrivia);
  const [errors, setErrors] = useState<Errors>({});
  const [openedFor, setOpenedFor] = useState<TriviaQuestion | null | undefined>(undefined);
  if (open && openedFor !== question) {
    setOpenedFor(question);
    setForm(question ? triviaFormOf(question) : emptyTrivia());
    setErrors({});
  }
  const set = <K extends keyof TriviaForm>(key: K, value: TriviaForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <FormDialog
      open={open}
      icon={QuestionMarkCircleIcon}
      title={question ? 'Edit question' : 'New question'}
      subtitle={question?.status === 'live' ? 'It is live: saving sends the change to phones.' : 'Delegates pick one of four answers.'}
      pending={pending}
      submitLabel={question ? 'Save question' : 'Add question'}
      error={error}
      onClose={() => {
        setOpenedFor(undefined);
        onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = triviaSchema.safeParse(form);
        if (!parsed.success) {
          const next: Errors = {};
          for (const issue of parsed.error.issues) next[issue.path[0] as keyof TriviaForm] ??= issue.message;
          setErrors(next);
          return;
        }
        onSave(parsed.data);
      }}
    >
      <div>
        <label htmlFor={id('text')} className="mb-1.5 block text-sm font-medium text-ink">
          Question
        </label>
        <textarea
          id={id('text')}
          rows={2}
          value={form.text}
          onChange={(e) => set('text', e.target.value)}
          placeholder="In what year was the Maputo Protocol adopted?"
          maxLength={300}
          aria-invalid={!!errors.text}
          autoFocus
          className={textareaClass(!!errors.text)}
        />
        {errors.text && <p className="mt-1 text-xs text-danger">{errors.text}</p>}
      </div>

      <fieldset>
        <div className="mb-1.5 flex items-baseline justify-between">
          <legend className="text-sm font-medium text-ink">Answers</legend>
          <span className="text-xs text-[#7c7c7c]">Tap a letter to mark the correct one</span>
        </div>
        <div role="radiogroup" aria-label="Correct answer" className="flex flex-col gap-2">
          {OPTIONS.map((o: TriviaOption) => {
            const key = `option${o}` as const;
            const correct = form.correctOption === o;
            return (
              <div key={o}>
                <div
                  className={cn(
                    'flex items-center rounded-lg border bg-surface shadow-xs focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                    errors[key] ? 'border-danger' : correct ? 'border-primary' : 'border-[#bdbdbd]',
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correct}
                    aria-label={`Answer ${o} is correct`}
                    onClick={() => set('correctOption', o)}
                    className={cn(
                      'ml-1.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                      correct ? 'bg-primary text-on-primary' : 'bg-[#f1f1f1] text-[#525252] hover:bg-[#e5e5e5]',
                    )}
                  >
                    {correct ? <CheckIcon className="size-4" /> : o}
                  </button>
                  <input
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={`Answer ${o}`}
                    aria-label={`Answer ${o}`}
                    aria-invalid={!!errors[key]}
                    maxLength={120}
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-placeholder"
                  />
                  {correct && <span className="mr-3 shrink-0 text-xs text-primary">Correct</span>}
                </div>
                {errors[key] && <p className="mt-1 text-xs text-danger">{errors[key]}</p>}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={id('explanation')} className="text-sm font-medium text-ink">
            Explanation <span className="font-normal text-[#7c7c7c]">(optional)</span>
          </label>
          <span className="text-xs tabular-nums text-[#7c7c7c]">{form.explanation.trim().length}/400</span>
        </div>
        <textarea
          id={id('explanation')}
          rows={2}
          value={form.explanation}
          onChange={(e) => set('explanation', e.target.value)}
          placeholder="Shown with the answer when the question closes."
          maxLength={400}
          aria-invalid={!!errors.explanation}
          className={textareaClass(!!errors.explanation)}
        />
        {errors.explanation && <p className="mt-1 text-xs text-danger">{errors.explanation}</p>}
      </div>
    </FormDialog>
  );
}
