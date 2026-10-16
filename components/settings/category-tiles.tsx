'use client';

import { ChevronLeftIcon, ChevronRightIcon, PhotoIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Panel } from '@/components/ui/panel';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toaster';
import { moveOption } from '@/lib/catalog/topics';
import { tileProblem, useCategories, useUpdateCategories, type Category } from '@/lib/catalog/use-categories';
import { useListMotion } from '@/lib/use-list-motion';
import { cn } from '@/lib/utils';

/** One tile's name and picture. */
function TileDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const save = useUpdateCategories(setProgress);
  const [label, setLabel] = useState('');
  // undefined: unchanged; null: remove the picture; a File: replace it
  const [image, setImage] = useState<File | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (category && openedFor !== category.slug) {
    setOpenedFor(category.slug);
    setLabel(category.label);
    setImage(undefined);
    setPreview(category.imageUrl);
    setProblem(null);
  }

  const pick = (file: File | undefined) => {
    if (!file) return;
    const reason = tileProblem(file);
    setProblem(reason);
    if (reason) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };
  const close = () => {
    setOpenedFor(null);
    save.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!category) return;
    const name = label.trim();
    if (!name) return setProblem('Give the tile a name.');
    save.mutate([{ slug: category.slug, label: name, ...(image !== undefined ? { image } : {}) }], {
      onSuccess: () => {
        toast.push({ title: 'Tile saved', body: `The app shows “${name}” on My Events.`, leading: { kind: 'icon', icon: Squares2X2Icon, tone: 'success' } });
        close();
      },
    });
  };

  return (
    <FormDialog
      open={category !== null}
      icon={Squares2X2Icon}
      title="Edit tile"
      subtitle="How this kind of event appears on the app’s My Events screen."
      pending={save.isPending}
      submitLabel={progress !== null ? `Uploading ${Math.round(progress * 100)}%` : 'Save'}
      error={save.error?.message ?? null}
      onClose={close}
      onSubmit={submit}
    >
      <Field id={`${id}-label`} label="Name" error={problem && !label.trim() ? problem : undefined}>
        <TextInput id={`${id}-label`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus />
      </Field>
      <div className="grid gap-2">
        <p className="text-sm text-ink">Picture</p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-soft">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed or local preview URL
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-center text-sm text-hint">
              <PhotoIcon className="size-7" />
              No picture: the app shows the next event’s cover.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`${id}-file`} className={buttonClass({ style: 'soft', color: 'gray', className: 'cursor-pointer' })}>
            {preview ? 'Replace picture' : 'Choose a picture'}
            <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setImage(null);
                setPreview(null);
              }}
              className={buttonClass({ style: 'borderless', color: 'danger' })}
            >
              Remove picture
            </button>
          )}
        </div>
        <p className={cn('text-xs', problem && label.trim() ? 'text-danger' : 'text-hint')}>{problem && label.trim() ? problem : 'JPG, PNG, WebP or HEIC, under 5 MB; landscape, about 4:3.'}</p>
      </div>
    </FormDialog>
  );
}

/** The app's category tiles: name, picture and order. */
export function CategoryTiles() {
  const categories = useCategories();
  const reorder = useUpdateCategories();
  const [editing, setEditing] = useState<Category | null>(null);
  const listRef = useListMotion<HTMLOListElement>();
  const list = categories.data ?? [];

  const move = (c: Category, direction: -1 | 1) => {
    const patches = moveOption(
      list.map((x) => ({ id: x.slug, label: x.label, sortOrder: x.sortOrder })),
      c.slug,
      direction,
    );
    if (patches.length) reorder.mutate(patches.map((p) => ({ slug: p.id as Category['slug'], sortOrder: p.sortOrder })));
  };

  return (
    <Panel title="Event categories" description="The tiles on the app’s My Events screen, in this order.">
      {categories.isPending ? (
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      ) : categories.isError ? (
        <ErrorState title="Categories could not load" error={categories.error} onRetry={() => void categories.refetch()} />
      ) : (
        <ol ref={listRef} className={cn('grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4', reorder.isPending && 'opacity-70')}>
          {list.map((c, i) => (
            <li key={c.slug} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <button type="button" onClick={() => setEditing(c)} className="group relative aspect-[4/3] overflow-hidden bg-surface-soft text-left" aria-label={`Edit ${c.label}`}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed tile artwork
                  <img src={c.imageUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-hint">
                    <PhotoIcon className="size-6" />
                    Add a picture
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="w-5 shrink-0 text-xs tabular-nums text-hint">{i + 1}</span>
                <button type="button" onClick={() => setEditing(c)} className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-primary">
                  {c.label}
                </button>
                <button
                  type="button"
                  onClick={() => move(c, -1)}
                  disabled={i === 0 || reorder.isPending}
                  aria-label={`Move ${c.label} earlier`}
                  className="rounded p-1 text-ink-soft hover:bg-surface-soft hover:text-ink disabled:opacity-30"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(c, 1)}
                  disabled={i === list.length - 1 || reorder.isPending}
                  aria-label={`Move ${c.label} later`}
                  className="rounded p-1 text-ink-soft hover:bg-surface-soft hover:text-ink disabled:opacity-30"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <TileDialog category={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}
