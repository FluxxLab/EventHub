'use client';

import { ArchiveBoxArrowDownIcon, ArrowUturnLeftIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, PencilSquareIcon, PlusIcon, RectangleStackIcon, TagIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import { moveOption, newTopicProblem, usageCounts, type TopicOption } from '@/lib/catalog/topics';
import { useCreateInterest, useCreateTrack, useDeleteTopic, useInterestLibrary, useTrackLibrary, useUpdateTopics } from '@/lib/catalog/use-topics';
import { useEditions } from '@/lib/events/use-editions';
import { cn } from '@/lib/utils';

type Kind = 'track' | 'interest';

const COPY = {
  track: {
    title: 'Tracks',
    description: 'The themes sessions are filed under and delegates follow. Each event picks its own from this list; General Programme is every event’s and is not listed.',
    add: 'Add track',
    icon: RectangleStackIcon,
  },
  interest: {
    title: 'Interests',
    description: 'What delegates choose on their profile to meet people. Each event picks which of these its delegates see.',
    add: 'Add interest',
    icon: TagIcon,
  },
} as const;

const byOrder = (a: TopicOption, b: TopicOption) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);

/** Add or edit one option. A value is fixed once created, so only the label (and a track's hint) change. */
function OptionDialog({ kind, open, option, library, onClose }: { kind: Kind; open: boolean; option: TopicOption | null; library: TopicOption[]; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const createTrack = useCreateTrack();
  const createInterest = useCreateInterest();
  const update = useUpdateTopics(kind);
  const [label, setLabel] = useState('');
  const [hint, setHint] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const stamp = open ? (option?.id ?? 'new') : null;
  if (stamp && stamp !== openedFor) {
    setOpenedFor(stamp);
    setLabel(option?.label ?? '');
    setHint(option && 'hint' in option ? option.hint : '');
    setProblem(null);
  }
  const pending = createTrack.isPending || createInterest.isPending || update.isPending;
  const error = createTrack.error ?? createInterest.error ?? update.error;

  const close = () => {
    setOpenedFor(null);
    createTrack.reset();
    createInterest.reset();
    update.reset();
    onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = label.trim();
    const others = library.filter((o) => o.id !== option?.id);
    const reason = newTopicProblem(name, others, kind);
    if (reason) return setProblem(reason);
    try {
      if (option) await update.mutateAsync([{ id: option.id, label: name, ...(kind === 'track' ? { hint: hint.trim() } : {}) }]);
      else if (kind === 'track') await createTrack.mutateAsync({ label: name, hint: hint.trim() || undefined });
      else await createInterest.mutateAsync(name);
      toast.push({ title: option ? 'Saved' : `${kind === 'track' ? 'Track' : 'Interest'} added`, body: option ? `“${name}” is updated everywhere it shows.` : `Events can now pick “${name}”.`, leading: { kind: 'icon', icon: COPY[kind].icon, tone: 'success' } });
      close();
    } catch {
      // the dialog shows the API's reason
    }
  };

  return (
    <FormDialog
      open={open}
      icon={COPY[kind].icon}
      title={option ? `Edit ${kind}` : COPY[kind].add}
      subtitle={option ? `Stored as “${option.value}”, which stays the same so sessions and profiles keep it.` : 'Added to the shared list. Tick it for an event on the Events page.'}
      pending={pending}
      submitLabel={option ? 'Save' : 'Add'}
      error={error?.message ?? null}
      onClose={close}
      onSubmit={(e) => void submit(e)}
    >
      <Field id={`${id}-label`} label="Name" error={problem ?? undefined}>
        <TextInput
          id={`${id}-label`}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setProblem(null);
          }}
          placeholder={kind === 'track' ? 'Climate & Environment' : 'Agriculture'}
          maxLength={kind === 'track' ? 80 : 60}
          invalid={!!problem}
          autoFocus
        />
      </Field>
      {kind === 'track' && (
        <Field id={`${id}-hint`} label="One line under it" optional hint="Shown under the track in the app’s pickers.">
          <TextInput id={`${id}-hint`} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Adaptation, energy and green jobs" maxLength={120} />
        </Field>
      )}
    </FormDialog>
  );
}

/** The shared list of tracks or interests: add, rename, reorder, retire, delete. */
export function TopicLibrary({ kind }: { kind: Kind }) {
  const toast = useToast();
  const tracks = useTrackLibrary();
  const interests = useInterestLibrary();
  const library = kind === 'track' ? tracks : interests;
  const editions = useEditions();
  const update = useUpdateTopics(kind);
  const remove = useDeleteTopic(kind);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ option: TopicOption | null } | null>(null);
  const [deleting, setDeleting] = useState<TopicOption | null>(null);

  const all: TopicOption[] = [...(library.data ?? [])].sort(byOrder);
  const q = query.trim().toLowerCase();
  const rows = q ? all.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : all;
  const used = usageCounts(editions.data ?? [], kind);
  const retired = all.filter((o) => !o.isActive).length;

  const move = (o: TopicOption, direction: -1 | 1) => {
    const patches = moveOption(all, o.id, direction);
    if (patches.length) update.mutate(patches);
  };
  const setActive = (o: TopicOption, isActive: boolean) =>
    update.mutate([{ id: o.id, isActive }], {
      onSuccess: () =>
        toast.push({
          title: isActive ? `“${o.label}” restored` : `“${o.label}” retired`,
          body: isActive ? 'Events can pick it again.' : 'No longer offered to events or in the app’s pickers. Events, sessions and profiles that have it keep it.',
          leading: { kind: 'icon', icon: isActive ? ArrowUturnLeftIcon : ArchiveBoxArrowDownIcon, tone: 'success' },
        }),
    });

  return (
    <section aria-label={COPY[kind].title} className="overflow-hidden rounded-lg border border-[#dcdcdc] bg-[#fdfdfd]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dcdcdc] px-5 py-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-xl font-medium leading-[30px] text-ink">{COPY[kind].title}</h2>
          <p className="text-sm leading-5 text-[#525252]">{COPY[kind].description}</p>
        </div>
        <button type="button" onClick={() => setEditing({ option: null })} className={buttonClass()}>
          <PlusIcon className="size-4" /> {COPY[kind].add}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-[#dcdcdc] px-5 py-3">
        <div className="w-full sm:w-72">
          <TextInput icon={MagnifyingGlassIcon} aria-label={`Search ${COPY[kind].title.toLowerCase()}`} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {library.data && (
          <p className="text-xs text-[#7c7c7c] sm:ml-auto">
            {all.length - retired} in use{retired > 0 && ` · ${retired} retired`}
          </p>
        )}
      </div>

      {library.isPending ? (
        <div className="grid gap-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : library.isError ? (
        <p role="alert" className="p-5 text-sm text-danger">
          {library.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-[#7c7c7c]">{q ? `Nothing matches “${query}”.` : `No ${kind}s yet.`}</p>
      ) : (
        <ul className={cn('transition-opacity', update.isPending && 'opacity-70')}>
          {rows.map((o) => {
            const index = all.indexOf(o);
            const count = used.get(o.value) ?? 0;
            return (
              <li key={o.id} className={cn('flex items-center gap-3 border-b border-[#f1f1f1] px-5 py-3 last:border-b-0', !o.isActive && 'bg-[#f6f6f6]/60')}>
                {/* reordering works on the whole list, so it pauses while searching */}
                <div className={cn('flex shrink-0 flex-col', q && 'invisible')}>
                  <button type="button" onClick={() => move(o, -1)} disabled={index === 0 || update.isPending} aria-label={`Move ${o.label} up`} className="rounded p-0.5 text-[#7c7c7c] hover:bg-[#f1f1f1] hover:text-ink disabled:opacity-30">
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(o, 1)} disabled={index === all.length - 1 || update.isPending} aria-label={`Move ${o.label} down`} className="rounded p-0.5 text-[#7c7c7c] hover:bg-[#f1f1f1] hover:text-ink disabled:opacity-30">
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('flex flex-wrap items-center gap-2 text-sm', o.isActive ? 'text-ink' : 'text-[#7c7c7c]')}>
                    <span className="truncate">{o.label}</span>
                    {!o.isActive && <Tag>Retired</Tag>}
                  </p>
                  <p className="truncate text-xs text-[#7c7c7c]">{'hint' in o && o.hint ? o.hint : kind === 'track' ? 'No hint line' : `Stored as “${o.value}”`}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-[#525252] sm:block">{count ? `${count} event${count === 1 ? '' : 's'}` : 'No events'}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setActive(o, !o.isActive)} disabled={update.isPending} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 px-2 text-xs' })}>
                    {o.isActive ? 'Retire' : 'Restore'}
                  </button>
                  <Tooltip label="Edit">
                    <button type="button" onClick={() => setEditing({ option: o })} aria-label={`Edit ${o.label}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                      <PencilSquareIcon className="size-4" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete" align="end">
                    <button type="button" onClick={() => setDeleting(o)} aria-label={`Delete ${o.label}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}>
                      <TrashIcon className="size-4" />
                    </button>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <OptionDialog kind={kind} open={editing !== null} option={editing?.option ?? null} library={all} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.label ?? ''}”?`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        pending={remove.isPending}
        tone="danger"
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.push({ title: `“${deleting.label}” deleted`, leading: { kind: 'icon', icon: TrashIcon, tone: 'success' } });
              setDeleting(null);
            },
          })
        }
      >
        {remove.error ? (
          <span className="text-danger">{remove.error.message}</span>
        ) : kind === 'track' ? (
          'Events that use it lose it. A track that sessions or pitches are filed under cannot be deleted; retire it instead.'
        ) : (
          'Events stop offering it. Delegates who already picked it keep it on their profile.'
        )}
      </ConfirmDialog>
    </section>
  );
}
