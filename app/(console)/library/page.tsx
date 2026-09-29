'use client';

import { AcademicCapIcon, ArrowDownIcon, ArrowTopRightOnSquareIcon, ArrowUpIcon, DocumentTextIcon, GlobeAltIcon, MusicalNoteIcon, PencilSquareIcon, PlayCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { byTopic, FILE_TYPES, fileProblem, isUpload, KIND_HINT, KIND_LABEL, LIBRARY_KINDS, linkProblem, sizeLabel, topicsOf, uploadType, type LibraryItem, type LibraryKind } from '@/lib/library/library';
import { uploadResource, useLibrary, useLibraryActions, type LibraryDraft } from '@/lib/library/use-library';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const KIND_ICON: Record<LibraryKind, typeof DocumentTextIcon> = { document: DocumentTextIcon, video: PlayCircleIcon, audio: MusicalNoteIcon, link: GlobeAltIcon };

/** The learning library in the app: resources organisers add here, shown with session materials and the Purple Book. */
export default function LibraryPage() {
  const page = usePageEdition();
  return <EventBar page={page} note="Learning library in the app">{(editionId) => <Board edition={page.list.find((e) => e.id === editionId)!} />}</EventBar>;
}

function Board({ edition }: { edition: Edition }) {
  const library = useLibrary(edition.id);
  const actions = useLibraryActions(edition.id);
  const toast = useToast();
  const [editing, setEditing] = useState<{ item: LibraryItem | null } | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);

  if (library.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (library.isError) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">The library could not load.</p>
        <p className="mt-1 text-sm text-muted">{library.error.message}</p>
      </div>
    );
  }
  const items = library.data;
  const groups = byTopic(items);
  const ordered = groups.flatMap((g) => g.items);

  return (
    <section aria-labelledby="library-title" className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 id="library-title" className="text-base font-medium text-ink">
            Learning library
          </h2>
          <p className="max-w-2xl text-sm text-[#7c7c7c]">In the app, delegates find these alongside every session’s slides and recordings (Materials page) and the Purple Book.</p>
        </div>
        <button type="button" onClick={() => setEditing({ item: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          Add resource
        </button>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <AcademicCapIcon className="size-6" />
          </span>
          <p className="font-medium text-ink">Nothing in the library yet</p>
          <p className="max-w-md text-sm text-[#7c7c7c]">Add reports, toolkits, explainer videos and courses for delegates to learn from, during the event and after it.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {groups.map((g) => (
            <div key={g.topic}>
              <h3 className="border-b border-border bg-[#f6f6f6] px-6 py-2 text-xs font-medium uppercase tracking-wide text-[#7c7c7c]">{g.topic}</h3>
              <ul className="divide-y divide-border">
                {g.items.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  const at = ordered.indexOf(item);
                  return (
                    <li key={item.id} className={cn('flex flex-wrap items-center gap-4 px-6 py-3', !item.isPublished && 'bg-[#fafafa]')}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate', item.isPublished ? 'text-ink' : 'text-[#7c7c7c]')}>{item.title}</p>
                        <p className="truncate text-xs text-[#7c7c7c]">{[KIND_LABEL[item.kind], item.sizeLabel, item.description].filter(Boolean).join(' · ')}</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[#525252]">
                        <Switch checked={item.isPublished} label={`${item.title}: show in the app`} onChange={(isPublished) => actions.save.mutate({ id: item.id, draft: { isPublished } }, { onError: (e) => toast.push({ title: 'Not changed', body: e.message }) })} />
                        {item.isPublished ? 'In the app' : 'Hidden'}
                      </label>
                      <div className="flex items-center">
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`} title="Open" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                            <ArrowTopRightOnSquareIcon className="size-4" />
                          </a>
                        )}
                        <button type="button" disabled={at <= 0} onClick={() => actions.move.mutate({ a: item, b: ordered[at - 1]! })} aria-label={`Move ${item.title} up`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                          <ArrowUpIcon className="size-4" />
                        </button>
                        <button type="button" disabled={at >= ordered.length - 1} onClick={() => actions.move.mutate({ a: item, b: ordered[at + 1]! })} aria-label={`Move ${item.title} down`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                          <ArrowDownIcon className="size-4" />
                        </button>
                        <button type="button" onClick={() => setEditing({ item })} aria-label={`Edit ${item.title}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                          <PencilSquareIcon className="size-4" />
                        </button>
                        <button type="button" onClick={() => setDeleting(item)} aria-label={`Delete ${item.title}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}>
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ResourceDialog
        edition={edition}
        item={editing?.item ?? null}
        open={!!editing}
        topics={topicsOf(items)}
        pending={actions.save.isPending}
        error={actions.save.error?.message ?? null}
        onClose={() => {
          setEditing(null);
          actions.save.reset();
        }}
        onSave={(draft) => actions.save.mutate({ id: editing?.item?.id, draft }, { onSuccess: () => setEditing(null) })}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete this resource?"
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        tone="danger"
        pending={actions.remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && actions.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        “{deleting?.title}” is removed from the app{deleting?.isFile ? ', and its file is deleted' : ''}.
      </ConfirmDialog>
    </section>
  );
}

function ResourceDialog({ edition, item, open, topics, pending, error, onClose, onSave }: { edition: Edition; item: LibraryItem | null; open: boolean; topics: string[]; pending: boolean; error: string | null; onClose: () => void; onSave: (d: LibraryDraft) => void }) {
  const id = useId();
  const [kind, setKind] = useState<LibraryKind>('document');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const token = open ? (item?.id ?? 'new') : null;
  if (token !== seen) {
    setSeen(token);
    setKind(item?.kind ?? 'document');
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setTopic(item?.topic ?? '');
    setLink(item && !item.isFile ? (item.url ?? '') : '');
    setFile(null);
    setProgress(null);
    setProblem(null);
  }
  const upload = isUpload(kind);
  const keepsFile = !!item?.isFile && item.kind === kind && !file;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setProblem('Give it a title.');
    let url = keepsFile ? undefined : link.trim();
    let size: string | null | undefined = keepsFile ? undefined : null;
    if (upload && !keepsFile) {
      if (!file) return setProblem('Choose the file.');
      const p = fileProblem(kind, file);
      if (p) return setProblem(p);
      setProgress(0);
      try {
        url = await uploadResource(edition.id, file, uploadType(file), setProgress);
        size = sizeLabel(file.size);
      } catch (err) {
        setProgress(null);
        return setProblem(err instanceof Error ? err.message : 'The upload failed.');
      }
      setProgress(null);
    } else if (!upload) {
      const p = linkProblem(link);
      if (p) return setProblem(p);
    }
    setProblem(null);
    onSave({ title: title.trim(), description: description.trim() || null, kind, topic: topic.trim() || null, isPublished: item?.isPublished ?? true, ...(url !== undefined ? { url } : {}), ...(size !== undefined ? { sizeLabel: size } : {}) } as LibraryDraft);
  };

  return (
    <FormDialog open={open} icon={AcademicCapIcon} title={item ? 'Edit resource' : 'Add a resource'} subtitle="Shown in the app’s learning library for this event." pending={pending || progress !== null} submitLabel={progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : item ? 'Save' : 'Add to library'} error={error} onSubmit={(e) => void submit(e)} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Kind">
        {LIBRARY_KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs', kind === k ? 'border-primary bg-primary-soft/40 text-ink' : 'border-border text-[#525252]')}>
              <Icon className="size-5" />
              {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>
      <p className="-mt-2 text-xs text-[#7c7c7c]">{KIND_HINT[kind]}.</p>
      <Field id={`${id}-t`} label="Title">
        <TextInput id={`${id}-t`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Gender budgeting toolkit" />
      </Field>
      {upload ? (
        <Field id={`${id}-f`} label="File" hint={keepsFile ? `Keeping the current file (${item?.sizeLabel ?? 'uploaded'}). Choose another to replace it.` : 'Up to 100 MB.'}>
          <input id={`${id}-f`} type="file" accept={FILE_TYPES[kind].join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-[#525252] file:mr-3 file:rounded-lg file:border-0 file:bg-[#f1f1f1] file:px-3 file:py-2 file:text-sm file:text-ink" />
        </Field>
      ) : (
        <Field id={`${id}-u`} label="Address">
          <TextInput id={`${id}-u`} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </Field>
      )}
      <Field id={`${id}-d`} label="Description" optional>
        <TextInput id={`${id}-d`} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="What delegates will learn from it" />
      </Field>
      <Field id={`${id}-p`} label="Topic" optional hint="Groups resources in the app, like “Toolkits” or “Gender data”.">
        <TextInput id={`${id}-p`} value={topic} maxLength={80} list={`${id}-topics`} onChange={(e) => setTopic(e.target.value)} />
        <datalist id={`${id}-topics`}>
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      {problem && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      )}
    </FormDialog>
  );
}
