'use client';

import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon, EyeSlashIcon, PencilSquareIcon, PhotoIcon, PlusIcon, StarIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { useSubPage } from '@/components/shell/breadcrumbs';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { modalClass } from '@/components/ui/modal';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { photoCount, PHOTO_TYPES, type Album, type Photo } from '@/lib/gallery/gallery';
import { useAlbumActions, useAlbumPhotos, useAlbums, usePhotoUpload } from '@/lib/gallery/use-gallery';
import { useListMotion } from '@/lib/use-list-motion';
import { cn } from '@/lib/utils';

/** The event's photo gallery: albums organisers fill here, which delegates browse in the app. */
export default function GalleryPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Photo gallery in the app">
      {(editionId) => <Board edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

function Board({ edition }: { edition: Edition }) {
  const albums = useAlbums(edition.id);
  const actions = useAlbumActions(edition.id);
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ album: Album | null } | null>(null);
  const open = albums.data?.find((a) => a.id === openId) ?? null;
  useSubPage(open ? open.title : null, () => setOpenId(null));

  if (albums.isPending) {
    return (
      <Panel title="Albums">
        <LoadingRows rows={3} />
      </Panel>
    );
  }
  if (albums.isError) return <ErrorState framed title="The gallery could not load" error={albums.error} onRetry={() => void albums.refetch()} />;

  const dialog = (
    <AlbumDialog
      album={editing?.album ?? null}
      open={!!editing}
      pending={actions.save.isPending}
      error={actions.save.error?.message ?? null}
      onClose={() => {
        setEditing(null);
        actions.save.reset();
      }}
      onSave={(body) =>
        actions.save.mutate(
          { id: editing?.album?.id, ...body },
          {
            onSuccess: (a) => {
              setEditing(null);
              if (!editing?.album) setOpenId(a.id);
            },
          },
        )
      }
    />
  );

  if (open) {
    return (
      <>
        <AlbumView
          edition={edition}
          album={open}
          onEdit={() => setEditing({ album: open })}
          onPublish={(isPublished) => actions.save.mutate({ id: open.id, isPublished }, { onError: (e) => toast.push({ title: 'Not changed', body: e.message }) })}
          onDeleted={() => setOpenId(null)}
        />
        {dialog}
      </>
    );
  }

  const newAlbum = (
    <button type="button" onClick={() => setEditing({ album: null })} className={buttonClass()}>
      <PlusIcon className="size-4" />
      New album
    </button>
  );

  return (
    <Panel title="Albums" count={albums.data.length} description={`Published albums show in the app under ${edition.shortName} › Gallery.`} actions={albums.data.length > 0 ? newAlbum : undefined}>
      {/* with no albums, the empty state offers New album instead */}
      {albums.data.length === 0 ? (
        <EmptyState icon={PhotoIcon} title="No albums yet" body="Make an album for each day or big moment, like “Day 1”, then add the photos to it." action={newAlbum} />
      ) : (
        <ul className="grid grid-cols-2 gap-5 p-6 md:grid-cols-3 xl:grid-cols-4">
          {albums.data.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpenId(a.id)} className="group flex w-full flex-col gap-2 text-left">
                <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-soft ring-1 ring-border">
                  {a.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage links
                    <img src={a.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <PhotoIcon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-placeholder" strokeWidth={1} />
                  )}
                  {!a.isPublished && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-xs text-ink">
                      <EyeSlashIcon className="size-3.5" /> Hidden
                    </span>
                  )}
                </span>
                <span className="truncate font-medium text-ink group-hover:text-primary">{a.title}</span>
                <span className="-mt-1.5 text-xs text-hint">{photoCount(a.photos)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Panel>
  );
}

function AlbumDialog({
  album,
  open,
  pending,
  error,
  onClose,
  onSave,
}: {
  album: Album | null;
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: { title: string; description: string | null; isPublished: boolean }) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setPublished] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const token = open ? (album?.id ?? 'new') : null;
  if (token !== seen) {
    setSeen(token);
    setTitle(album?.title ?? '');
    setDescription(album?.description ?? '');
    setPublished(album?.isPublished ?? true);
    setProblem(null);
  }
  const dirty = open && (title !== (album?.title ?? '') || description !== (album?.description ?? '') || isPublished !== (album?.isPublished ?? true));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setProblem('Give the album a name.');
    onSave({ title: title.trim(), description: description.trim() || null, isPublished });
  };
  return (
    <FormDialog
      open={open}
      icon={PhotoIcon}
      title={album ? 'Edit album' : 'New album'}
      subtitle="Albums group an event’s photos in the app."
      pending={pending}
      submitLabel={album ? 'Save album' : 'Create album'}
      error={error}
      dirty={dirty}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field id={`${id}-t`} label="Name" error={problem ?? undefined}>
        <TextInput id={`${id}-t`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Day 1: opening plenary" invalid={!!problem} />
      </Field>
      <Field id={`${id}-d`} label="Description" optional>
        <TextInput id={`${id}-d`} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Photos by the PIC media team" />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p id={`${id}-p`} className="text-sm text-ink">
            Show in the app
          </p>
          <p className="text-xs text-hint">Turn off while you are still adding photos.</p>
        </div>
        <Switch checked={isPublished} onChange={setPublished} labelledBy={`${id}-p`} />
      </div>
    </FormDialog>
  );
}

function AlbumView({ edition, album, onEdit, onPublish, onDeleted }: { edition: Edition; album: Album; onEdit: () => void; onPublish: (on: boolean) => void; onDeleted: () => void }) {
  const photos = useAlbumPhotos(album.id);
  const actions = useAlbumActions(edition.id);
  const upload = usePhotoUpload(edition.id, album.id);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const gridRef = useListMotion<HTMLUListElement>();

  const add = (files: FileList | null) => {
    if (!files?.length || upload.running) return;
    void upload.run(Array.from(files)).then(() => toast.push({ title: 'Photos added', body: `Added to “${album.title}”.`, leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' } }));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  };
  const done = upload.items.filter((i) => i.state === 'done').length;
  const failed = upload.items.filter((i) => i.state === 'failed');

  return (
    <Panel
      title={album.title}
      description={
        <>
          {photoCount(album.photos)}
          {album.description ? ` · ${album.description}` : ''}
        </>
      }
      actions={
        <>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <Switch checked={album.isPublished} onChange={onPublish} label="Show in the app" />
            {album.isPublished ? 'In the app' : 'Hidden'}
          </label>
          <button type="button" onClick={onEdit} className={buttonClass({ style: 'borderless', color: 'gray' })}>
            <PencilSquareIcon className="size-4" /> Edit
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
            <TrashIcon className="size-4" /> Delete
          </button>
        </>
      }
      bodyClassName="flex flex-col gap-5 p-6"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors', dragging ? 'border-primary bg-primary-soft/40' : 'border-border')}
      >
        <ArrowUpTrayIcon className="size-8 text-hint" strokeWidth={1.25} />
        <p className="text-sm text-ink">Drop photos here, or</p>
        <button type="button" disabled={upload.running} onClick={() => input.current?.click()} className={buttonClass({ className: 'h-9' })}>
          Choose photos
        </button>
        <p className="text-xs text-hint">JPEG, PNG or WebP, up to 15 MB each.</p>
        <input ref={input} type="file" multiple accept={PHOTO_TYPES.join(',')} className="sr-only" onChange={(e) => add(e.target.files)} />
      </div>

      {upload.items.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-soft p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-ink">{upload.running ? `Uploading ${done} of ${upload.items.length - failed.length}…` : `${done} added${failed.length ? `, ${failed.length} not added` : ''}`}</p>
            {!upload.running && (
              <button type="button" onClick={upload.clear} className="text-xs text-hint hover:text-ink">
                Clear
              </button>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(upload.items.reduce((n, i) => n + (i.state === 'failed' ? 1 : i.progress), 0) / upload.items.length) * 100}%` }}
            />
          </div>
          {failed.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-danger">
              {failed.slice(0, 8).map((f) => (
                <li key={f.name} className="flex items-start gap-1.5">
                  <ExclamationCircleIcon className="size-4 shrink-0" /> {f.error ?? `${f.name}: not added`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {photos.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : photos.isError && !photos.data ? (
        <ErrorState title="The photos could not load" error={photos.error} onRetry={() => void photos.refetch()} />
      ) : (photos.data ?? []).length === 0 ? (
        <EmptyState icon={PhotoIcon} title="No photos in this album yet" body="Drop photos above, or choose them, to add them." />
      ) : (
        <ul ref={gridRef} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.data!.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setViewing(p)}
                className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-soft"
                aria-label={p.caption ?? 'Open photo'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links */}
                <img src={p.thumbUrl ?? p.url ?? ''} alt={p.caption ?? ''} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                {(album.coverPhotoId === p.id || (!album.coverPhotoId && photos.data![0]?.id === p.id)) && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-surface/90 px-1.5 py-0.5 text-[0.625rem] text-ink">Cover</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <PhotoDialog
        photo={viewing}
        isCover={!!viewing && album.coverPhotoId === viewing.id}
        onClose={() => setViewing(null)}
        onCaption={(caption) =>
          viewing &&
          actions.updatePhoto.mutate(
            { photo: viewing, caption },
            {
              // the viewer may have closed (or moved on) while it saved
              onSuccess: (p) => setViewing((v) => (v?.id === p.id ? p : v)),
              onError: (e) => toast.push({ title: 'Caption not saved', body: e.message }),
            },
          )
        }
        onCover={() =>
          viewing && actions.save.mutate({ id: album.id, coverPhotoId: viewing.id }, { onSuccess: () => toast.push({ title: 'Cover set', body: 'The app shows this photo on the album.' }) })
        }
        onDelete={() => viewing && actions.removePhoto.mutate(viewing, { onSuccess: () => setViewing(null) })}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this album?"
        confirmLabel="Delete album"
        pendingLabel="Deleting…"
        tone="danger"
        pending={actions.remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => actions.remove.mutate(album.id, { onSuccess: onDeleted })}
      >
        “{album.title}” and its {photoCount(album.photos).toLowerCase()} are deleted from the console and the app.
      </ConfirmDialog>
    </Panel>
  );
}

/** One photo large, with its caption, "use as cover" and delete. */
function PhotoDialog({
  photo,
  isCover,
  onClose,
  onCaption,
  onCover,
  onDelete,
}: {
  photo: Photo | null;
  isCover: boolean;
  onClose: () => void;
  onCaption: (c: string | null) => void;
  onCover: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [caption, setCaption] = useState('');
  // the last caption sent, so a blur right after closing does not send it twice
  const sent = useRef<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if ((photo?.id ?? null) !== seen) {
    setSeen(photo?.id ?? null);
    setCaption(photo?.caption ?? '');
  }
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (photo && !d.open) d.showModal();
    if (!photo && d.open) d.close();
  }, [photo]);
  const saveCaption = () => {
    if (!photo) return;
    const next = caption.trim();
    const key = `${photo.id}:${next}`;
    if (next === (photo.caption ?? '') || sent.current === key) return;
    sent.current = key;
    onCaption(next || null);
  };
  // Escape, the backdrop and × all keep a caption being typed: it is saved, then the viewer closes
  const close = () => {
    saveCaption();
    onClose();
  };
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      className={modalClass('lg')}
      aria-label="Photo"
    >
      {photo && (
        <div className="flex flex-col">
          <div className="relative flex max-h-[65dvh] items-center justify-center bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links */}
            <img src={photo.url ?? photo.thumbUrl ?? ''} alt={photo.caption ?? ''} className="max-h-[65dvh] w-auto object-contain" />
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <XMarkIcon className="size-5" />
            </button>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex gap-2">
              <input
                value={caption}
                maxLength={300}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={saveCaption}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveCaption())}
                placeholder="Caption: who is in it, what is happening"
                aria-label="Caption"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-placeholder focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-hint">
              <span>
                {photo.width} × {photo.height} px · {(photo.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={isCover} onClick={onCover} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9' })}>
                  <StarIcon className="size-4" /> {isCover ? 'Album cover' : 'Use as cover'}
                </button>
                <button type="button" onClick={onDelete} className={buttonClass({ style: 'soft', color: 'danger', className: 'h-9' })}>
                  <TrashIcon className="size-4" /> Delete photo
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
