'use client';

import {
  ArchiveBoxArrowDownIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  TagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import { moveOption, newTopicProblem, usageCounts, type TopicOption } from '@/lib/catalog/topics';
import { useCreateInterest, useCreateTrack, useDeleteTopic, useInterestLibrary, useTrackLibrary, useUpdateTopics } from '@/lib/catalog/use-topics';
import { useEditions } from '@/lib/events/use-editions';
import { useListMotion } from '@/lib/use-list-motion';
import { cn } from '@/lib/utils';

type Kind = 'track' | 'interest';

const COPY = {
  track: {
    title: 'Tracks',
    description: 'Themes sessions are filed under; each event picks its own. General Programme is always included.',
    add: 'Add track',
    icon: RectangleStackIcon,
  },
  interest: {
    title: 'Interests',
    description: 'What delegates pick on their profile to meet people; each event chooses which to show.',
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
      toast.push({
        title: option ? 'Saved' : `${kind === 'track' ? 'Track' : 'Interest'} added`,
        body: option ? `“${name}” is updated everywhere it shows.` : `Events can now pick “${name}”.`,
        leading: { kind: 'icon', icon: COPY[kind].icon, tone: 'success' },
      });
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
      subtitle={option ? `Stored as “${option.value}”; that never changes, so sessions and profiles keep it.` : 'Tick it for an event on the Events page.'}
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
  const listRef = useListMotion<HTMLUListElement>();

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
    <Panel
      title={COPY[kind].title}
      count={library.data ? all.length : undefined}
      description={COPY[kind].description}
      actions={
        <button type="button" onClick={() => setEditing({ option: null })} className={buttonClass()}>
          <PlusIcon className="size-4" /> {COPY[kind].add}
        </button>
      }
      toolbar={
        <>
          <div className="w-full sm:w-72">
            <TextInput icon={MagnifyingGlassIcon} aria-label={`Search ${COPY[kind].title.toLowerCase()}`} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {library.data && (
            <p className="text-xs text-hint sm:ml-auto">
              {all.length - retired} in use{retired > 0 && ` · ${retired} retired`}
            </p>
          )}
        </>
      }
    >
      {library.isPending ? (
        <LoadingRows rows={4} />
      ) : library.isError ? (
        <ErrorState title={`${COPY[kind].title} could not load`} error={library.error} onRetry={() => void library.refetch()} />
      ) : rows.length === 0 ? (
        q ? (
          <EmptyState
            icon={MagnifyingGlassIcon}
            title={`Nothing matches “${query}”`}
            action={
              <button type="button" onClick={() => setQuery('')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Clear search
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={COPY[kind].icon}
            title={`No ${kind}s yet`}
            action={
              <button type="button" onClick={() => setEditing({ option: null })} className={buttonClass({ style: 'outline', color: 'gray' })}>
                <PlusIcon className="size-4" /> {COPY[kind].add}
              </button>
            }
          />
        )
      ) : (
        <ul ref={listRef} className={cn('transition-opacity', update.isPending && 'opacity-70')}>
          {rows.map((o) => {
            const index = all.indexOf(o);
            const count = used.get(o.value) ?? 0;
            return (
              <li key={o.id} className={cn('flex items-center gap-3 border-b border-border px-6 py-3 last:border-b-0', !o.isActive && 'bg-surface-soft/60')}>
                {/* reordering works on the whole list, so it pauses while searching */}
                <div className={cn('flex shrink-0 flex-col', q && 'invisible')}>
                  <button
                    type="button"
                    onClick={() => move(o, -1)}
                    disabled={index === 0 || update.isPending}
                    aria-label={`Move ${o.label} up`}
                    className="rounded p-0.5 text-ink-soft hover:bg-surface-soft hover:text-ink disabled:opacity-30"
                  >
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(o, 1)}
                    disabled={index === all.length - 1 || update.isPending}
                    aria-label={`Move ${o.label} down`}
                    className="rounded p-0.5 text-ink-soft hover:bg-surface-soft hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('flex flex-wrap items-center gap-2 text-sm', o.isActive ? 'text-ink' : 'text-hint')}>
                    <span className="truncate">{o.label}</span>
                    {!o.isActive && <Tag>Retired</Tag>}
                  </p>
                  <p className="truncate text-xs text-hint">{'hint' in o && o.hint ? o.hint : kind === 'track' ? 'No hint line' : `Stored as “${o.value}”`}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-ink-soft sm:block">{count ? `${count} event${count === 1 ? '' : 's'}` : 'No events'}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActive(o, !o.isActive)}
                    disabled={update.isPending}
                    className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 px-2 text-xs' })}
                  >
                    {o.isActive ? 'Retire' : 'Restore'}
                  </button>
                  <Tooltip label="Edit">
                    <button
                      type="button"
                      onClick={() => setEditing({ option: o })}
                      aria-label={`Edit ${o.label}`}
                      className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}
                    >
                      <PencilSquareIcon className="size-4" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete" align="end">
                    <button
                      type="button"
                      onClick={() => setDeleting(o)}
                      aria-label={`Delete ${o.label}`}
                      className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
                    >
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
    </Panel>
  );
}
