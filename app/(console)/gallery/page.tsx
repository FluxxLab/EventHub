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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { photoCount, PHOTO_TYPES, type Album, type Photo } from '@/lib/gallery/gallery';
import { useAlbumActions, useAlbumPhotos, useAlbums, usePhotoUpload } from '@/lib/gallery/use-gallery';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';

/** The event's photo gallery: albums organisers fill here, which delegates browse in the app. */
export default function GalleryPage() {
  const page = usePageEdition();
  return <EventBar page={page} note="Photo gallery in the app">{(editionId) => <Board edition={page.list.find((e) => e.id === editionId)!} />}</EventBar>;
}

function Board({ edition }: { edition: Edition }) {
  const albums = useAlbums(edition.id);
  const actions = useAlbumActions(edition.id);
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ album: Album | null } | null>(null);
  const open = albums.data?.find((a) => a.id === openId) ?? null;
  useSubPage(open ? open.title : null, () => setOpenId(null));

  if (albums.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (albums.isError) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">The gallery could not load.</p>
        <p className="mt-1 text-sm text-muted">{albums.error.message}</p>
      </div>
    );
  }

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

  return (
    <section aria-labelledby="albums-title" className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 id="albums-title" className="text-base font-medium text-ink">
            Albums
          </h2>
          <p className="text-sm text-[#7c7c7c]">Delegates see published albums in the app, under {edition.shortName} › Gallery.</p>
        </div>
        <button type="button" onClick={() => setEditing({ album: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          New album
        </button>
      </header>
      {albums.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <PhotoIcon className="size-6" />
          </span>
          <p className="font-medium text-ink">No albums yet</p>
          <p className="max-w-md text-sm text-[#7c7c7c]">Make an album for each day or big moment, like “Day 1” or “Opening plenary”, then add the photographers’ pictures to it.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-5 p-6 md:grid-cols-3 xl:grid-cols-4">
          {albums.data.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpenId(a.id)} className="group flex w-full flex-col gap-2 text-left">
                <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-[#f1f1f1] ring-1 ring-border">
                  {a.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage links
                    <img src={a.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <PhotoIcon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-[#bdbdbd]" strokeWidth={1} />
                  )}
                  {!a.isPublished && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2 py-0.5 text-xs text-white">
                      <EyeSlashIcon className="size-3.5" /> Hidden
                    </span>
                  )}
                </span>
                <span className="truncate font-medium text-ink group-hover:text-primary">{a.title}</span>
                <span className="-mt-1.5 text-xs text-[#7c7c7c]">{photoCount(a.photos)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
}

function AlbumDialog({ album, open, pending, error, onClose, onSave }: { album: Album | null; open: boolean; pending: boolean; error: string | null; onClose: () => void; onSave: (body: { title: string; description: string | null; isPublished: boolean }) => void }) {
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setProblem('Give the album a name.');
    onSave({ title: title.trim(), description: description.trim() || null, isPublished });
  };
  return (
    <FormDialog open={open} icon={PhotoIcon} title={album ? 'Edit album' : 'New album'} subtitle="Albums group an event’s photos in the app." pending={pending} submitLabel={album ? 'Save album' : 'Create album'} error={error} onSubmit={submit} onClose={onClose}>
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
          <p className="text-xs text-[#7c7c7c]">Turn off while you are still adding photos.</p>
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
    <section aria-labelledby="album-title" className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id="album-title" className="truncate text-lg font-medium text-ink">
            {album.title}
          </h2>
          <p className="text-sm text-[#7c7c7c]">
            {photoCount(album.photos)}
            {album.description ? ` · ${album.description}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#525252]">
            <Switch checked={album.isPublished} onChange={onPublish} label="Show in the app" />
            {album.isPublished ? 'In the app' : 'Hidden'}
          </label>
          <button type="button" onClick={onEdit} className={buttonClass({ style: 'borderless', color: 'gray' })}>
            <PencilSquareIcon className="size-4" /> Edit
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
            <TrashIcon className="size-4" /> Delete
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors', dragging ? 'border-primary bg-primary-soft/40' : 'border-border')}
        >
          <ArrowUpTrayIcon className="size-8 text-[#7c7c7c]" strokeWidth={1.25} />
          <p className="text-sm text-ink">Drop photos here, or</p>
          <button type="button" disabled={upload.running} onClick={() => input.current?.click()} className={buttonClass({ className: 'h-9' })}>
            Choose photos
          </button>
          <p className="text-xs text-[#7c7c7c]">JPEG, PNG or WebP, up to 15 MB each. Choose as many as you like.</p>
          <input ref={input} type="file" multiple accept={PHOTO_TYPES.join(',')} className="sr-only" onChange={(e) => add(e.target.files)} />
        </div>

        {upload.items.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-[#f6f6f6] p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-ink">{upload.running ? `Uploading ${done} of ${upload.items.length - failed.length}…` : `${done} added${failed.length ? `, ${failed.length} not added` : ''}`}</p>
              {!upload.running && (
                <button type="button" onClick={upload.clear} className="text-xs text-[#7c7c7c] hover:text-ink">
                  Clear
                </button>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(upload.items.reduce((n, i) => n + (i.state === 'failed' ? 1 : i.progress), 0) / upload.items.length) * 100}%` }} />
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
        ) : (photos.data ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-[#7c7c7c]">No photos in this album yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.data!.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setViewing(p)} className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-[#f1f1f1]" aria-label={p.caption ?? 'Open photo'}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links */}
                  <img src={p.thumbUrl ?? p.url ?? ''} alt={p.caption ?? ''} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  {(album.coverPhotoId === p.id || (!album.coverPhotoId && photos.data![0]?.id === p.id)) && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[10px] text-white">Cover</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PhotoDialog
        photo={viewing}
        isCover={!!viewing && album.coverPhotoId === viewing.id}
        onClose={() => setViewing(null)}
        onCaption={(caption) => viewing && actions.updatePhoto.mutate({ photo: viewing, caption }, { onSuccess: (p) => setViewing(p) })}
        onCover={() => viewing && actions.save.mutate({ id: album.id, coverPhotoId: viewing.id }, { onSuccess: () => toast.push({ title: 'Cover set', body: 'The app shows this photo on the album.' }) })}
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
    </section>
  );
}

/** One photo large, with its caption, "use as cover" and delete. */
function PhotoDialog({ photo, isCover, onClose, onCaption, onCover, onDelete }: { photo: Photo | null; isCover: boolean; onClose: () => void; onCaption: (c: string | null) => void; onCover: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [caption, setCaption] = useState('');
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
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={modalClass('lg')}
      aria-label="Photo"
    >
      {photo && (
        <div className="flex flex-col">
          <div className="relative flex max-h-[65dvh] items-center justify-center bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links */}
            <img src={photo.url ?? photo.thumbUrl ?? ''} alt={photo.caption ?? ''} className="max-h-[65dvh] w-auto object-contain" />
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <XMarkIcon className="size-5" />
            </button>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex gap-2">
              <input
                value={caption}
                maxLength={300}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={() => caption.trim() !== (photo.caption ?? '') && onCaption(caption.trim() || null)}
                placeholder="Caption: who is in it, what is happening"
                aria-label="Caption"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7c7c7c]">
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
