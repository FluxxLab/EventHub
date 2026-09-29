'use client';

import Link from 'next/link';
import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  GlobeAltIcon,
  KeyIcon,
  MapIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { RoomDialog } from '@/components/venue/room-dialog';
import { StreamDialog } from '@/components/venue/stream-dialog';
import { runsEvents, useSession } from '@/lib/auth/session';
import type { Edition } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import { INPUT_LABEL, SOURCE_LABEL, streamStatus, type IngestRoom, type StreamCredentials } from '@/lib/ingest/ingest';
import { useIngestActions, useIngestRooms } from '@/lib/ingest/use-ingest';
import { cn } from '@/lib/utils';
import { mapEmbedUrl, parsePin, venueFormOf, venuePatch, venueSchema, type Room, type VenueForm } from '@/lib/venue/venue';
import { useRoomMutations, useRooms, useSaveVenue } from '@/lib/venue/use-venue';

const cardClass =
  'overflow-hidden rounded-2xl border border-border bg-surface shadow-lg';
const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

function CardHeader({ id, title, description, action }: { id: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
      <div>
        <h2 id={id} className="text-xl font-medium text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-[#7c7c7c]">{description}</p>
      </div>
      {action}
    </header>
  );
}

/** One settings row: what it is and why on the left, the fields on the right. */
function SettingsRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-border px-6 py-6 last:border-b-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#7c7c7c]">{description}</p>
      </div>
      <div className="flex max-w-xl flex-col gap-4">{children}</div>
    </div>
  );
}

/**
 * Venue name, address, city and map pin, saved onto the edition. The pin is one pasted
 * "lat, lng" (as Google Maps copies it) with a live map preview; only changed fields are sent.
 */
function VenueCard({ edition }: { edition: Edition }) {
  const initial = useMemo(() => venueFormOf(edition), [edition]);
  const [form, setForm] = useState<VenueForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof VenueForm, string>>>({});
  const save = useSaveVenue(edition.id);
  const toast = useToast();

  // A different edition (or a fresh copy from the server) resets the form.
  const [shownFor, setShownFor] = useState(initial);
  if (shownFor !== initial) {
    setShownFor(initial);
    setForm(initial);
    setErrors({});
  }

  const dirty = (Object.keys(form) as (keyof VenueForm)[]).some((k) => form[k].trim() !== initial[k].trim());
  const pin = parsePin(form.pin);
  const set = (key: keyof VenueForm, value: string) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    const parsed = venueSchema.safeParse(form);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof VenueForm] ??= issue.message;
      setErrors(next);
      return;
    }
    const patch = venuePatch(initial, parsed.data);
    if (Object.keys(patch).length === 0) return;
    save.mutate(patch, {
      onSuccess: () =>
        toast.push({ title: 'Venue saved', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: 'Delegates see the new details on the venue page.' }),
    });
  };

  return (
    <section aria-labelledby="venue-title" className={cardClass}>
      <CardHeader id="venue-title" title="Venue" description="Where the event happens, as the app's venue page shows it." />
      <form onSubmit={onSubmit} noValidate>
        <SettingsRow title="Location" description="The name delegates look for on arrival, and the address their maps app is given.">
          <Field id="venue-name" label="Venue name" error={errors.venue}>
            <TextInput id="venue-name" icon={BuildingOffice2Icon} value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Transcorp Hilton" invalid={!!errors.venue} />
          </Field>
          <Field id="venue-address" label="Street address" error={errors.address}>
            <TextInput
              id="venue-address"
              icon={MapPinIcon}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="1 Aguiyi Ironsi Street, Maitama"
              invalid={!!errors.address}
            />
          </Field>
          <Field id="venue-city" label="City" error={errors.city} className="sm:max-w-xs">
            <TextInput id="venue-city" icon={GlobeAltIcon} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Abuja" invalid={!!errors.city} />
          </Field>
        </SettingsRow>

        <SettingsRow title="Map pin" description="In Google Maps, right-click the entrance and click the numbers at the top to copy them, then paste here.">
          <Field id="venue-pin" label="Coordinates" optional error={errors.pin}>
            <TextInput
              id="venue-pin"
              icon={MapIcon}
              inputMode="decimal"
              value={form.pin}
              onChange={(e) => set('pin', e.target.value)}
              placeholder="9.0579, 7.4951"
              invalid={!!errors.pin}
              aria-describedby={describedBy('venue-pin', errors.pin)}
            />
          </Field>
          {pin && pin !== 'invalid' ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <iframe title="Map preview of the venue pin" src={mapEmbedUrl(pin)} className="block h-56 w-full" loading="lazy" />
              <a
                href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 border-t border-border bg-[#f6f6f6] px-3 py-2 text-xs text-[#525252] hover:text-primary"
              >
                Check the pin sits on the entrance
                <ArrowTopRightOnSquareIcon className="size-4" />
              </a>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-[#7c7c7c]">
              <MapIcon className="size-5" />
              {pin === 'invalid' ? 'Those numbers are not a place on the map yet.' : 'Paste coordinates to preview the pin.'}
            </div>
          )}
        </SettingsRow>

        {save.error && (
          <p role="alert" className="mx-6 mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {save.error.message}
          </p>
        )}

        {/* The save bar says what state the form is in, so "Save" is never a guess. */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#f6f6f6] px-6 py-4">
          <p className="flex items-center gap-2 text-xs text-[#7c7c7c]" aria-live="polite">
            {dirty ? (
              <>
                <span className="size-2 rounded-full bg-secondary" aria-hidden />
                Unsaved changes
              </>
            ) : (
              'All changes saved'
            )}
          </p>
          <div className="flex gap-3">
            <button type="button" disabled={!dirty || save.isPending} onClick={() => setForm(initial)} className={buttonClass({ style: 'outline', color: 'gray' })}>
              Discard
            </button>
            <button type="submit" disabled={!dirty || save.isPending} className={buttonClass()}>
              {save.isPending ? 'Saving…' : 'Save venue'}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}

/** The venue's rooms: described ones can be edited or removed; programme-only ones can be described. */
function RoomsCard({ edition }: { edition: Edition }) {
  const rooms = useRooms(edition);
  const { remove } = useRoomMutations(edition.id);
  const toast = useToast();
  const [editing, setEditing] = useState<{ room: Room | null } | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const confirmDelete = () => {
    if (!deleting?.id) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.push({ title: 'Room removed', leading: { kind: 'icon', icon: TrashIcon }, body: `${deleting.name}’s details are gone; sessions naming it still list it.` });
        setDeleting(null);
      },
    });
  };

  return (
    <section aria-labelledby="rooms-title" className={cardClass}>
      <CardHeader
        id="rooms-title"
        title="Rooms"
        description="Rooms delegates are sent to, with the sessions each one hosts."
        action={
          <button type="button" onClick={() => setEditing({ room: null })} className={buttonClass()}>
            <PlusIcon className="size-4" />
            Add room
          </button>
        }
      />

      {rooms.hiddenWhileDraft ? (
        <p className="p-10 text-center text-sm text-muted">
          Rooms are listed once the event is announced. You can still add them now; they will appear here when it goes live.
        </p>
      ) : rooms.isError && !rooms.data ? (
        <div role="alert" className="p-10 text-center">
          <p className="font-medium text-ink">Rooms could not load.</p>
          <p className="mt-1 text-sm text-muted">{rooms.error.message}</p>
          <button type="button" onClick={() => void rooms.refetch()} className={buttonClass({ className: 'mt-4' })}>
            Try again
          </button>
        </div>
      ) : (rooms.data ?? []).length === 0 && !rooms.isPending ? (
        // An empty table is just a header; a real empty state says what rooms are for.
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <BuildingOffice2Icon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">No rooms yet</p>
            <p className="mt-1 max-w-sm text-sm text-[#7c7c7c]">Add the halls and breakout rooms so sessions, live captions and the app&apos;s venue page can point delegates to them.</p>
          </div>
          <button type="button" onClick={() => setEditing({ room: null })} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PlusIcon className="size-4" />
            Add the first room
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Room
                </th>
                <th scope="col" className={th}>
                  Notes
                </th>
                <th scope="col" className={cn(th, 'w-32')}>
                  Sessions
                </th>
                <th scope="col" className={cn(th, 'w-28')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody aria-busy={rooms.isPending}>
              {rooms.isPending
                ? [0, 1, 2].map((i) => (
                    <tr key={i} className="even:bg-[#f6f6f6]">
                      <td colSpan={4} className={td}>
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                : rooms.data!.map((room) => (
                    <tr key={room.id ?? `named-${room.name}`} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                      <td className={td}>
                        <p className="text-[#525252]">{room.name}</p>
                        <p className="text-xs text-placeholder">{room.floor ?? (room.id ? 'No floor set' : 'Named by the programme only')}</p>
                      </td>
                      <td className={cn(td, 'max-w-md')}>
                        {room.notes ? <p className="line-clamp-2 text-[#525252]">{room.notes}</p> : <span className="text-placeholder">No notes</span>}
                      </td>
                      <td className={td}>
                        <Tag tone={room.sessionCount > 0 ? 'primary' : 'gray'}>
                          {room.sessionCount} {room.sessionCount === 1 ? 'session' : 'sessions'}
                        </Tag>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {room.id ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing({ room })}
                              className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true })}
                              aria-label={`Edit ${room.name}`}
                              title="Edit"
                            >
                              <PencilSquareIcon className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(room)}
                              className={buttonClass({ style: 'borderless', color: 'danger', iconOnly: true })}
                              aria-label={`Remove ${room.name}`}
                              title="Remove"
                            >
                              <TrashIcon className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setEditing({ room })} className={buttonClass({ style: 'soft', color: 'primary' })}>
                            Describe
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <RoomDialog open={!!editing} onClose={() => setEditing(null)} editionId={edition.id} room={editing?.room ?? null} />
      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.name ?? 'this room'}?`}
        confirmLabel="Remove room"
        pendingLabel="Removing…"
        pending={remove.isPending}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        Its floor and notes are deleted. Sessions that name this room keep it, and it stays listed from the programme.
      </ConfirmDialog>
    </section>
  );
}

/**
 * Each room's venue stream: the venue mixer sends the room to LiveKit, and the API captions it
 * with nobody at a desk. Organisers create a stream per room and hand the AV team its settings.
 */
function AudioStreamsCard({ edition }: { edition: Edition }) {
  const streams = useIngestRooms();
  const { rotate, remove } = useIngestActions();
  const toast = useToast();
  const session = useSession();
  const isAdmin = session.status === 'signed-in' && runsEvents(session.user.tier);
  const [creating, setCreating] = useState<string | null>(null);
  const [shown, setShown] = useState<StreamCredentials | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'remove'; room: IngestRoom } | null>(null);
  const pending = rotate.isPending || remove.isPending;

  const confirmNow = () => {
    if (!confirm) return;
    const { room } = confirm.room;
    if (confirm.kind === 'rotate') {
      rotate.mutate(
        { room },
        {
          onSuccess: (credentials) => {
            setConfirm(null);
            setShown(credentials);
          },
        },
      );
    } else {
      remove.mutate(
        { room },
        {
          onSuccess: () => {
            setConfirm(null);
            toast.push({ title: 'Stream removed', leading: { kind: 'icon', icon: TrashIcon }, body: `${room} can still be captioned from the Sound desk.` });
          },
        },
      );
    }
  };

  return (
    <section aria-labelledby="streams-title" className={cardClass}>
      <CardHeader
        id="streams-title"
        title="Audio streams"
        description="Captions straight from the venue mixer, one stream per room, with nobody at a desk."
        action={
          <Link href="/captions" className={buttonClass({ style: 'outline', color: 'gray' })}>
            Open captions
          </Link>
        }
      />

      {!edition.isCurrent ? (
        <p className="p-10 text-center text-sm text-muted">Streams belong to the current event. Switch to it to set them up.</p>
      ) : streams.disabled ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <SignalIcon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Venue streams are switched off</p>
            <p className="mt-1 max-w-md text-sm text-[#7c7c7c]">
              The server needs <code className="font-mono text-xs">INGEST_ENABLED=true</code> and the LiveKit keys. Until then, caption rooms from the Sound desk.
            </p>
          </div>
        </div>
      ) : streams.isError && !streams.data ? (
        <div role="alert" className="p-10 text-center">
          <p className="font-medium text-ink">Streams could not load.</p>
          <p className="mt-1 text-sm text-muted">{streams.error.message}</p>
          <button type="button" onClick={() => void streams.refetch()} className={buttonClass({ className: 'mt-4' })}>
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-176 border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Room
                </th>
                <th scope="col" className={th}>
                  Stream
                </th>
                <th scope="col" className={cn(th, 'w-36')}>
                  Captions now
                </th>
                <th scope="col" className={cn(th, 'w-52')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody aria-busy={streams.isPending}>
              {streams.isPending
                ? [0, 1, 2].map((i) => (
                    <tr key={i}>
                      <td colSpan={4} className={td}>
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                : streams.data!.map((r) => {
                    const status = streamStatus(r);
                    return (
                      <tr key={r.room} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                        <td className={td}>
                          <p className="text-[#525252]">{r.room}</p>
                          {r.stream && (
                            <p className="text-xs text-placeholder">
                              {INPUT_LABEL[r.stream.input]} · {r.stream.diarise ? 'labels speakers' : 'no speaker labels'}
                            </p>
                          )}
                        </td>
                        <td className={td}>
                          <Tag tone={status.tone} dot={status.dot}>
                            {status.label}
                          </Tag>
                        </td>
                        <td className={cn(td, 'text-[#525252]')}>{r.captioning ? SOURCE_LABEL[r.captioning] : <span className="text-placeholder">Off</span>}</td>
                        <td className={cn(td, 'text-right')}>
                          {!isAdmin ? null : r.stream ? (
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => setConfirm({ kind: 'rotate', room: r })} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                                <KeyIcon className="size-4" />
                                New key
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirm({ kind: 'remove', room: r })}
                                className={buttonClass({ style: 'borderless', color: 'danger', iconOnly: true })}
                                aria-label={`Remove the stream for ${r.room}`}
                                title="Remove stream"
                              >
                                <TrashIcon className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setCreating(r.room)} className={buttonClass({ style: 'soft', color: 'primary' })}>
                              <PlusIcon className="size-4" />
                              Create stream
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      <StreamDialog
        room={creating ?? shown?.room ?? null}
        credentials={shown}
        onClose={() => {
          setCreating(null);
          setShown(null);
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'rotate' ? `New key for ${confirm.room.room}?` : `Remove the stream for ${confirm?.room.room ?? 'this room'}?`}
        confirmLabel={confirm?.kind === 'rotate' ? 'Make a new key' : 'Remove stream'}
        pendingLabel={confirm?.kind === 'rotate' ? 'Making…' : 'Removing…'}
        pending={pending}
        tone={confirm?.kind === 'remove' || confirm?.room.stream?.state === 'publishing' ? 'danger' : 'default'}
        onConfirm={confirmNow}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.room.stream?.state === 'publishing'
          ? 'Its encoder is streaming now and is cut off at once; captions for the room stop until the encoder is given the new settings. '
          : ''}
        {confirm?.kind === 'rotate' ? 'The old key stops working, and the new settings are shown once.' : 'The room can still be captioned from the Sound desk.'}
        {(rotate.error ?? remove.error) && <span className="mt-2 block text-xs text-danger">{(rotate.error ?? remove.error)!.message}</span>}
      </ConfirmDialog>
    </section>
  );
}

const TABS = [
  { key: 'venue', label: 'Venue details', icon: MapPinIcon },
  { key: 'rooms', label: 'Rooms', icon: BuildingOffice2Icon },
  { key: 'streams', label: 'Audio streams', icon: SignalIcon },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** Underline tabs: arrow keys move between them, as a tablist should. */
function Tabs({ tab, onChange, roomCount }: { tab: Tab; onChange: (tab: Tab) => void; roomCount: number | undefined }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = TABS[(TABS.findIndex((t) => t.key === tab) + 1) % TABS.length]!.key;
    onChange(next);
    document.getElementById(`venue-tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Venue sections" onKeyDown={onKey} className="flex gap-6 border-b border-border">
      {TABS.map((t) => {
        const selected = tab === t.key;
        return (
          <button
            key={t.key}
            id={`venue-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`venue-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors',
              selected ? 'border-primary font-medium text-primary' : 'border-transparent text-[#525252] hover:text-ink',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {t.key === 'rooms' && roomCount !== undefined && <Tag tone={selected ? 'primary' : 'gray'}>{roomCount}</Tag>}
          </button>
        );
      })}
    </div>
  );
}

export default function VenuePage() {
  const editions = useEditions();
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('venue');
  const edition = editions.data?.find((e) => e.id === picked) ?? editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  // Shares the Rooms card's query (same key), so the tab count costs no extra request.
  const rooms = useRooms(edition);

  if (editions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-5xl rounded-2xl" />;
  if (!edition) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-surface p-10 text-center">
        <h1 className="text-xl font-medium text-ink">No events yet</h1>
        <p className="mt-2 text-sm text-muted">A venue belongs to an event. Create the event first.</p>
        <Link href="/events" className={buttonClass({ className: 'mt-6' })}>
          Go to Events
        </Link>
      </div>
    );
  }

  return (
    // A settings page, not a full-bleed table: a readable column, centred.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-medium text-ink">{edition.name}</h1>
          <p className="mt-0.5 text-sm text-[#7c7c7c]">Venue details, rooms and their audio streams for this event.</p>
        </div>
        <div className="w-80 max-w-full">
          <Select
            label="Event"
            value={edition.id}
            options={(editions.data ?? []).map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))}
            onChange={setPicked}
          />
        </div>
      </header>
      <Tabs tab={tab} onChange={setTab} roomCount={rooms.data?.length} />
      <div id={`venue-panel-${tab}`} role="tabpanel" aria-labelledby={`venue-tab-${tab}`}>
        {tab === 'venue' ? <VenueCard edition={edition} /> : tab === 'rooms' ? <RoomsCard edition={edition} /> : <AudioStreamsCard edition={edition} />}
      </div>
    </div>
  );
}
