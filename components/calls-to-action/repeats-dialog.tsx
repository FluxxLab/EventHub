'use client';

import { DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Tag } from '@/components/ui/tag';
import { STATUS_LABEL, voices, type CallToAction } from '@/lib/calls-to-action/calls-to-action';
import { keeperOf, pairKey, type Repeat } from '@/lib/calls-to-action/repeats';
import { cn } from '@/lib/utils';

/**
 * Calls that look like the same thing said twice, side by side. Keeping one merges the other
 * into it (its speaker is kept with it), so the deck and the report count it once; "Not the
 * same" hides the pair.
 */
export function RepeatsDialog({
  open,
  repeats,
  titleOf,
  onMerge,
  onDismiss,
  onClose,
}: {
  open: boolean;
  repeats: Repeat[];
  titleOf: (sessionId: string | null) => string;
  /** Folds `other` into `keep`; resolves when done. */
  onMerge: (keep: CallToAction, other: CallToAction) => Promise<void>;
  onDismiss: (pair: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keep = (r: Repeat, which: CallToAction) => {
    const other = which.id === r.a.id ? r.b : r.a;
    setBusy(pairKey(r.a.id, r.b.id));
    setError(null);
    onMerge(which, other)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };

  const side = (r: Repeat, c: CallToAction) => {
    const suggested = keeperOf(r).id === c.id;
    return (
      <div key={c.id} className={cn('flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border p-3 text-sm', suggested ? 'border-primary/40 bg-primary-soft/30' : 'border-border')}>
        <p className="flex flex-wrap gap-1.5 text-xs text-hint">
          <span className="font-medium text-ink-soft">{titleOf(c.sessionId)}</span>
          {c.status !== 'suggested' && <Tag tone={c.status === 'approved' ? 'green' : 'gray'}>{STATUS_LABEL[c.status]}</Tag>}
        </p>
        <p className="font-medium text-ink">{c.shortText}</p>
        {voices(c) && <p className="text-xs text-ink-soft">{voices(c)}</p>}
        <button type="button" disabled={busy !== null} onClick={() => keep(r, c)} className={cn('mt-auto self-start', suggested ? buttonClass({ className: 'h-8' }) : buttonClass({ style: 'outline', color: 'gray', className: 'h-8' }))}>
          Keep this one
        </button>
      </div>
    );
  };

  return (
    <FormDialog
      open={open}
      icon={DocumentDuplicateIcon}
      title="Repeated calls"
      subtitle={repeats.length ? repeats.length === 1 ? '1 pair that looks like the same thing said twice' : `${repeats.length} pairs that look like the same thing said twice` : 'No repeats left'}
      pending={false}
      submitLabel="Done"
      error={error}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onClose();
      }}
    >
      <p className="text-sm text-ink-soft">
        Keep the one in the right session; the other is merged into it with its speaker, so the deck and report count it once. The suggested one is highlighted: approved, or with a name.
      </p>
      {repeats.length === 0 ? (
        <p className="text-sm text-hint">Every call is said once.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {repeats.map((r) => {
            const k = pairKey(r.a.id, r.b.id);
            return (
              <li key={k} className={cn('flex flex-col gap-2', busy === k && 'opacity-60')}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {side(r, r.a)}
                  {side(r, r.b)}
                </div>
                <div className="flex items-center justify-between text-xs text-hint">
                  <span>{Math.round(r.score * 100)}% alike</span>
                  <button type="button" disabled={busy !== null} onClick={() => onDismiss(k)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-7 text-xs' })}>
                    Not the same
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FormDialog>
  );
}
