'use client';

import { CheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useState, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { newTopicProblem, pickable, toggleValue, type TopicOption } from '@/lib/catalog/topics';
import { cn } from '@/lib/utils';

/**
 * Ticks an event's tracks or interests from the shared library, as chips. One that is missing
 * can be added to the library from here, and comes back ticked.
 */
export function TopicPicker({
  id,
  label,
  noun,
  hint,
  library,
  error,
  selected,
  onChange,
  onCreate,
}: {
  id: string;
  label: string;
  noun: 'track' | 'interest';
  hint: string;
  library: TopicOption[] | undefined;
  error: string | null;
  selected: string[];
  onChange: (values: string[]) => void;
  /** Adding to the shared list; left out, the picker only ticks (event organisers cannot add). */
  onCreate?: (label: string) => Promise<TopicOption>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = pickable(library ?? [], selected);
  const allOn = options.length > 0 && options.every((o) => selected.includes(o.value));

  const add = async () => {
    const reason = newTopicProblem(draft, library ?? [], noun);
    if (reason) return setProblem(reason);
    setSaving(true);
    try {
      if (!onCreate) return;
      const created = await onCreate(draft.trim());
      onChange([...selected, created.value]);
      setDraft('');
      setAdding(false);
      setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter adds this one rather than submitting the whole form
    if (e.key === 'Enter') {
      e.preventDefault();
      void add();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAdding(false);
      setProblem(null);
    }
  };

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="grid gap-2 sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p id={`${id}-label`} className="text-sm text-ink">
          {label} <span className="text-xs text-[#7c7c7c]">{library ? `${selected.length} of ${options.length}` : ''}</span>
        </p>
        {options.length > 1 && (
          <button type="button" onClick={() => onChange(allOn ? [] : options.map((o) => o.value))} className="text-xs text-primary hover:underline">
            {allOn ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      <p className="-mt-1 text-xs text-[#7c7c7c]">{hint}</p>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : !library ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                title={'hint' in o && o.hint ? o.hint : undefined}
                onClick={() => onChange(toggleValue(selected, o.value))}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                  on ? 'border-primary bg-primary-soft text-primary' : 'border-border text-[#525252] hover:border-[#bdbdbd] hover:text-ink',
                )}
              >
                {on && <CheckIcon className="size-3.5" />}
                {o.label}
                {!o.isActive && <span className="text-xs text-[#7c7c7c]">(retired)</span>}
              </button>
            );
          })}
          {onCreate && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-[#bdbdbd] px-3 text-sm text-[#525252] hover:border-primary hover:text-primary"
            >
              <PlusIcon className="size-3.5" /> New {noun}
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <TextInput
              aria-label={`New ${noun}`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setProblem(null);
              }}
              onKeyDown={onKey}
              placeholder={noun === 'track' ? 'Climate & Environment' : 'Agriculture'}
              invalid={!!problem}
              maxLength={noun === 'track' ? 80 : 60}
              autoFocus
              className="flex-1"
            />
            <button type="button" onClick={() => void add()} disabled={saving} className={buttonClass({ style: 'outline', color: 'primary' })}>
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setProblem(null);
                setDraft('');
              }}
              className={buttonClass({ style: 'borderless', color: 'gray' })}
            >
              Cancel
            </button>
          </div>
          <p className={cn('text-xs', problem ? 'text-danger' : 'text-[#7c7c7c]')}>{problem ?? `Added to the shared list too, so other events can use it.`}</p>
        </div>
      )}
    </div>
  );
}
