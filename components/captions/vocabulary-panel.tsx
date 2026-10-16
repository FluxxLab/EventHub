'use client';

import { BookOpenIcon, CheckIcon, PlusIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toaster';
import { addTerms, MAX_TERMS, useCaptionVocabulary, useSetCaptionVocabulary } from '@/lib/captions/vocabulary';
import { useWorkingEdition } from '@/lib/events/working-edition';

/**
 * Vocabulary: words the working event's captions should listen for, so they are not heard as
 * common words ("full product", not "food"). Speakers' names and organisations, and the event's
 * name, are listened for already.
 */
export function VocabularyPanel() {
  const working = useWorkingEdition();
  const editionId = working.edition?.id;
  const vocabulary = useCaptionVocabulary(editionId);

  if (working.editions.isPending || (editionId && vocabulary.isPending)) return <Skeleton className="h-96 rounded-xl" />;
  if (!editionId) return <EmptyState framed icon={BookOpenIcon} title="No event picked" body="Pick an event at the top to edit its vocabulary." />;
  if (vocabulary.isError) return <ErrorState framed title="The vocabulary could not load" error={vocabulary.error} onRetry={() => void vocabulary.refetch()} />;

  return <VocabularyEditor key={`${editionId}:${JSON.stringify(vocabulary.data)}`} editionId={editionId} eventName={working.edition?.shortName ?? 'this event'} saved={vocabulary.data ?? []} />;
}

function VocabularyEditor({ editionId, eventName, saved }: { editionId: string; eventName: string; saved: string[] }) {
  const toast = useToast();
  const save = useSetCaptionVocabulary(editionId);
  const [terms, setTerms] = useState(saved);
  const [typed, setTyped] = useState('');
  const dirty = JSON.stringify(terms) !== JSON.stringify(saved);
  const full = terms.length >= MAX_TERMS;

  const add = (event: FormEvent) => {
    event.preventDefault();
    setTerms((all) => addTerms(all, typed));
    setTyped('');
  };

  const submit = () =>
    save.mutate(terms, {
      onSuccess: (list) =>
        toast.push({
          title: 'Vocabulary saved',
          body: `${list.length} ${list.length === 1 ? 'term' : 'terms'} for ${eventName}. Used from the next session that goes live.`,
          leading: { kind: 'icon', icon: CheckIcon, tone: 'success' },
        }),
      onError: (e) =>
        toast.push({
          title: 'Vocabulary not saved',
          body: e.message,
          leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' },
        }),
    });

  return (
    <Panel
      title={`Vocabulary · ${eventName}`}
      description="Words the captions should listen for: acronyms, programme names, places."
      actions={
        <button type="button" disabled={!dirty || save.isPending} onClick={submit} className={buttonClass()}>
          <CheckIcon className="size-4" />
          {save.isPending ? 'Saving…' : 'Save vocabulary'}
        </button>
      }
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={full}
            placeholder="e.g. full product, FMWASD, Kaduna"
            aria-label="Terms to add, separated by commas"
            className="min-w-0 flex-1"
          />
          <button type="submit" disabled={full || !typed.trim()} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PlusIcon className="size-4" />
            Add
          </button>
        </form>
        <p className="text-xs text-hint">Separate terms with commas, or paste a list; up to {MAX_TERMS} terms of 60 characters. Speakers and the event’s name are listened for already.</p>

        {terms.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-hint">
            <BookOpenIcon className="size-4" /> No terms yet: captions listen for the speakers’ names and the event’s name only.
          </p>
        ) : (
          <ul aria-label="Terms" className="flex flex-wrap gap-2">
            {terms.map((t) => (
              <li key={t} className="flex items-center gap-1 rounded-full border border-border bg-surface-soft py-1 pl-3 pr-1 text-sm text-ink">
                {t}
                <button type="button" onClick={() => setTerms((all) => all.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="rounded-full p-1 text-hint hover:bg-border hover:text-danger">
                  <XMarkIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-hint">
          {terms.length} of {MAX_TERMS} terms. A session already live keeps the words it started with.
        </p>
      </div>
    </Panel>
  );
}
