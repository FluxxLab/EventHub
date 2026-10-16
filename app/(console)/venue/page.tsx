'use client';

import Link from 'next/link';
import { ArrowTopRightOnSquareIcon, BuildingOffice2Icon, CheckCircleIcon, GlobeAltIcon, KeyIcon, MapIcon, MapPinIcon, PlusIcon, SignalIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { tabPanelId, tabId, UnderlineTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { RoomDialog } from '@/components/venue/room-dialog';
import { StreamDialog } from '@/components/venue/stream-dialog';
import { runsEvents, useSession } from '@/lib/auth/session';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { INPUT_LABEL, SOURCE_LABEL, streamStatus, type IngestRoom, type StreamCredentials } from '@/lib/ingest/ingest';
import { useIngestActions, useIngestRooms } from '@/lib/ingest/use-ingest';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { mapEmbedUrl, parsePin, venueFormOf, venuePatch, venueSchema, type Room, type VenueForm } from '@/lib/venue/venue';
import { useRoomMutations, useRooms, useSaveVenue } from '@/lib/venue/use-venue';

const th = 'h-15 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

/** One settings row: what it is and why on the left, the fields on the right. */
function SettingsRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-border px-6 py-6 last:border-b-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-hint">{description}</p>
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
      onSuccess: () => toast.push({ title: 'Venue saved', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: 'Delegates see the new details on the venue page.' }),
    });
  };

  return (
    <Panel title="Venue" description="Where the event happens, as the app's venue page shows it.">
      <form onSubmit={onSubmit} noValidate>
        <SettingsRow title="Location" description="The name delegates look for, and the address their maps app is given.">
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

        <SettingsRow title="Map pin" description="In Google Maps, right-click the entrance, click the numbers to copy them, then paste here.">
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
                className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-3 py-2 text-xs text-ink-soft hover:text-primary"
              >
                Check the pin sits on the entrance
                <ArrowTopRightOnSquareIcon className="size-4" />
              </a>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-hint">
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
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-soft px-6 py-4">
          <p className="flex items-center gap-2 text-xs text-hint" aria-live="polite">
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
    </Panel>
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
    <Panel
      title="Rooms"
      count={rooms.data?.length}
      description="Rooms delegates are sent to, with the sessions each one hosts."
      actions={
        <button type="button" onClick={() => setEditing({ room: null })} className={buttonClass()}>
          <PlusIcon className="size-4" />
          Add room
        </button>
      }
    >
      {rooms.hiddenWhileDraft ? (
        <EmptyState icon={BuildingOffice2Icon} title="Rooms are listed once the event is announced" body="You can add them now; they appear here when it goes live." />
      ) : rooms.isError && !rooms.data ? (
        <ErrorState title="Rooms could not load" error={rooms.error} onRetry={() => void rooms.refetch()} />
      ) : rooms.isPending ? (
        <LoadingRows rows={3} />
      ) : rooms.data!.length === 0 ? (
        <EmptyState
          icon={BuildingOffice2Icon}
          title="No rooms yet"
          body="Add the halls and breakout rooms so sessions, captions and the venue page can point delegates to them."
          action={
            <button type="button" onClick={() => setEditing({ room: null })} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Add room
            </button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto">
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
                <th scope="col" className={cn(th, 'w-36')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.data!.map((room) => (
                <tr key={room.id ?? `named-${room.name}`} className="even:bg-surface-soft last:[&>td]:border-b-0">
                  <td className={td}>
                    <p className="text-ink-soft">{room.name}</p>
                    <p className="text-xs text-placeholder">{room.floor ?? (room.id ? 'No floor set' : 'Named by the programme only')}</p>
                  </td>
                  <td className={cn(td, 'max-w-md')}>{room.notes ? <p className="line-clamp-2 text-ink-soft">{room.notes}</p> : <span className="text-placeholder">No notes</span>}</td>
                  <td className={td}>
                    <Tag tone={room.sessionCount > 0 ? 'primary' : 'gray'}>
                      {room.sessionCount} {room.sessionCount === 1 ? 'session' : 'sessions'}
                    </Tag>
                  </td>
                  <td className={cn(td, 'text-right')}>
                    {room.id ? (
                      <RowActions name={room.name} onEdit={() => setEditing({ room })} onDelete={() => setDeleting(room)} />
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
    </Panel>
  );
}

/**
 * Each room's venue stream: the venue mixer sends the room to LiveKit, and the API captions it
 * with nobody at a desk. Organisers create a stream per room and hand the AV team its settings.
 */
function AudioStreamsCard({ edition, onAddRooms }: { edition: Edition; onAddRooms: () => void }) {
  const streams = useIngestRooms();
  const working = useWorkingEdition();
  const currentEdition = working.editions.data?.find((e) => e.isCurrent);
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
    <Panel
      title="Audio streams"
      description="Captions straight from the venue mixer, one stream per room."
      actions={
        <Link href="/captions" className={buttonClass({ style: 'outline', color: 'gray' })}>
          Open captions
        </Link>
      }
    >
      {!edition.isCurrent ? (
        <EmptyState
          icon={SignalIcon}
          title="Streams belong to the current event"
          body="Switch to it to set them up."
          action={
            currentEdition && (
              <button type="button" onClick={() => working.setEditionId(currentEdition.id)} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Switch to {currentEdition.shortName}
              </button>
            )
          }
        />
      ) : streams.disabled ? (
        <EmptyState
          icon={SignalIcon}
          title="Venue streams are switched off"
          body={
            <>
              The server needs <code className="font-mono text-xs">INGEST_ENABLED=true</code> and the LiveKit keys. Until then, caption rooms from the Sound desk.
            </>
          }
        />
      ) : streams.isError && !streams.data ? (
        <ErrorState title="Streams could not load" error={streams.error} onRetry={() => void streams.refetch()} />
      ) : streams.isPending ? (
        <LoadingRows rows={3} />
      ) : streams.data!.length === 0 ? (
        <EmptyState
          icon={SignalIcon}
          title="No rooms to stream yet"
          body="Each room gets its own stream. Add the rooms first."
          action={
            <button type="button" onClick={onAddRooms} className={buttonClass({ style: 'outline', color: 'gray' })}>
              Go to Rooms
            </button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto">
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
            <tbody>
              {streams.data!.map((r) => {
                const status = streamStatus(r);
                return (
                  <tr key={r.room} className="even:bg-surface-soft last:[&>td]:border-b-0">
                    <td className={td}>
                      <p className="text-ink-soft">{r.room}</p>
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
                    <td className={cn(td, 'text-ink-soft')}>{r.captioning ? SOURCE_LABEL[r.captioning] : <span className="text-placeholder">Off</span>}</td>
                    <td className={cn(td, 'text-right')}>
                      {!isAdmin ? null : r.stream ? (
                        <RowActions
                          name={`the stream for ${r.room}`}
                          actions={[{ label: 'New key', icon: KeyIcon, onSelect: () => setConfirm({ kind: 'rotate', room: r }) }]}
                          onDelete={() => setConfirm({ kind: 'remove', room: r })}
                        />
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
        {confirm?.room.stream?.state === 'publishing' ? 'Its encoder is streaming now and is cut off at once; captions for the room stop until the encoder is given the new settings. ' : ''}
        {confirm?.kind === 'rotate' ? 'The old key stops working, and the new settings are shown once.' : 'The room can still be captioned from the Sound desk.'}
        {(rotate.error ?? remove.error) && <span className="mt-2 block text-xs text-danger">{(rotate.error ?? remove.error)!.message}</span>}
      </ConfirmDialog>
    </Panel>
  );
}

const TABS = ['venue', 'rooms', 'streams'] as const;
type Tab = (typeof TABS)[number];

export default function VenuePage() {
  const page = usePageEdition();
  return (
    <>
      <h1 className="sr-only">Venue</h1>
      <EventBar page={page}>{(editionId) => <VenueBoard edition={page.list.find((e) => e.id === editionId)!} />}</EventBar>
    </>
  );
}

/** The working event's venue details, rooms and audio streams, a tab each. */
function VenueBoard({ edition }: { edition: Edition }) {
  const [tab, setTab] = useUrlParam<Tab>('tab', 'venue', TABS);
  // Shares the Rooms card's query (same key), so the tab count costs no extra request.
  const rooms = useRooms(edition);
  return (
    <div className="flex flex-col gap-6">
      <UnderlineTabs
        label="Venue sections"
        idBase="venue"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'venue', label: 'Venue details', icon: MapPinIcon },
          { value: 'rooms', label: 'Rooms', icon: BuildingOffice2Icon, count: rooms.data?.length },
          { value: 'streams', label: 'Audio streams', icon: SignalIcon },
        ]}
      />
      <div id={tabPanelId('venue', tab)} role="tabpanel" aria-labelledby={tabId('venue', tab)}>
        {tab === 'venue' ? <VenueCard edition={edition} /> : tab === 'rooms' ? <RoomsCard edition={edition} /> : <AudioStreamsCard edition={edition} onAddRooms={() => setTab('rooms')} />}
      </div>
    </div>
  );
}
