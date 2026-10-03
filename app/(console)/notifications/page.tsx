'use client';

import { ArrowTopRightOnSquareIcon, BellAlertIcon, CalendarDaysIcon, PaperAirplaneIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useMemo, useState, type FormEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { ago } from '@/lib/format';
import {
  announcementSchema,
  audienceLabel,
  AUTOMATIC,
  BODY_VISIBLE,
  categoryLabel,
  emptyAnnouncement,
  isAnnouncement,
  TITLE_VISIBLE,
  toAnnouncementBody,
  toggleMuted,
  type AnnouncementForm,
  type SentNotification,
  type Target,
} from '@/lib/notifications/notifications';
import { useMutedNotifications, useNotificationActions, useSentNotifications, useWhatsAppReach, type AnnouncementBody } from '@/lib/notifications/use-notifications';
import { useSessions } from '@/lib/programme/use-sessions';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
type Errors = Partial<Record<keyof AnnouncementForm, string>>;

/** A row of options that reads as one choice (radio semantics). */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-lg border px-3 text-sm transition-colors',
            value === o.value ? 'border-primary bg-primary-soft/50 font-medium text-primary' : 'border-border text-[#525252] hover:border-[#bdbdbd]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Roughly how the push lands on a phone's lock screen, cut where phones cut it. */
function PhonePreview({ title, body }: { title: string; body: string }) {
  return (
    <section aria-label="Preview" className={cardClass}>
      <header className="border-b border-border px-5 py-3">
        <p className="text-sm text-ink">On a phone</p>
      </header>
      <div className="bg-[linear-gradient(160deg,#0b2b5c,#1f4fa3)] px-4 py-8">
        <div className="rounded-2xl bg-white/90 px-3.5 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] text-[#525252]">
            <span className="flex size-5 items-center justify-center rounded-md bg-primary text-[8px] font-medium text-on-primary">PIC</span>
            PIC Events
            <span className="ml-auto">now</span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-ink">{title.trim() || 'Your title'}</p>
          <p className="line-clamp-3 text-sm leading-5 text-[#3a3a3a]">{body.trim() || 'Your message appears here, cut off after about three lines.'}</p>
        </div>
      </div>
    </section>
  );
}

type Reach = 'event' | 'everyone';

function Composer({
  form,
  errors,
  sessions,
  pending,
  reach,
  eventName,
  tiers,
  canReachEveryone,
  onReach,
  onChange,
  onSubmit,
}: {
  form: AnnouncementForm;
  errors: Errors;
  sessions: { value: string; label: string }[];
  pending: boolean;
  reach: Reach;
  eventName: string;
  /** The event's ticket tiers, from Ticketing. */
  tiers: { id: string; name: string }[];
  /** Organisers may send to everyone on the app; event organisers only to their event's delegates. */
  canReachEveryone: boolean;
  onReach: (reach: Reach) => void;
  onChange: <K extends keyof AnnouncementForm>(key: K, value: AnnouncementForm[K]) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const id = useId();
  const titleLong = form.title.trim().length > TITLE_VISIBLE;
  const bodyLong = form.body.trim().length > BODY_VISIBLE;
  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`} className={cardClass}>
      <header className="border-b border-border px-6 py-4">
        <h2 id={`${id}-title`} className="text-base font-medium text-ink">
          New announcement
        </h2>
        <p className="text-sm text-[#7c7c7c]">A push to delegates’ phones, kept in their inbox in the app.</p>
      </header>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div>
          <p className="mb-1.5 text-sm text-ink">Reaches</p>
          {canReachEveryone ? (
            <Choice
              label="Reaches"
              value={reach}
              options={[
                { value: 'event', label: `${eventName} delegates` },
                { value: 'everyone', label: 'Everyone on the app' },
              ]}
              onChange={onReach}
            />
          ) : (
            <p className="text-sm text-[#525252]">{eventName} delegates: ticket holders and people who saved or attended its sessions.</p>
          )}
        </div>
        {reach === 'event' && (
          <div>
            <p className="mb-1.5 text-sm text-ink">To</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Ticket tiers">
              <button
                type="button"
                aria-pressed={form.ticketTypeIds.length === 0}
                onClick={() => onChange('ticketTypeIds', [])}
                className={cn('rounded-full border px-3 py-1 text-sm', form.ticketTypeIds.length === 0 ? 'border-primary bg-primary text-white' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
              >
                Everyone
              </button>
              {tiers.map((t) => {
                const on = form.ticketTypeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange('ticketTypeIds', on ? form.ticketTypeIds.filter((id) => id !== t.id) : [...form.ticketTypeIds, t.id])}
                    className={cn('rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary text-white' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-[#7c7c7c]">
              {tiers.length === 0
                ? `${eventName} has no ticket tiers yet; add them in Ticketing to send to some of them.`
                : form.ticketTypeIds.length
                  ? 'Only people holding a ticket in the chosen tiers.'
                  : 'Ticket holders and people who saved or attended its sessions.'}
            </p>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`${id}-t`} className="text-sm text-ink">
              Title
            </label>
            <span className={cn('text-xs tabular-nums', titleLong ? 'text-[#7a5d00]' : 'text-[#7c7c7c]')}>
              {form.title.trim().length}/{TITLE_VISIBLE}
              {titleLong && ' · cut off on lock screens'}
            </span>
          </div>
          <TextInput id={`${id}-t`} value={form.title} onChange={(e) => onChange('title', e.target.value)} placeholder="Lunch is served" invalid={!!errors.title} maxLength={255} />
          {errors.title && <p className="mt-1 text-xs text-danger">{errors.title}</p>}
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`${id}-b`} className="text-sm text-ink">
              Message
            </label>
            <span className={cn('text-xs tabular-nums', bodyLong ? 'text-[#7a5d00]' : 'text-[#7c7c7c]')}>
              {form.body.trim().length}/{BODY_VISIBLE}
              {bodyLong && ' · the rest shows in the app'}
            </span>
          </div>
          <textarea
            id={`${id}-b`}
            rows={3}
            value={form.body}
            onChange={(e) => onChange('body', e.target.value)}
            placeholder="On the garden terrace until 2pm."
            maxLength={1000}
            aria-invalid={!!errors.body}
            className={cn(
              'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm leading-5 text-ink shadow-xs outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
              errors.body ? 'border-danger' : 'border-[#bdbdbd]',
            )}
          />
          {errors.body && <p className="mt-1 text-xs text-danger">{errors.body}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-sm text-ink">When tapped, open</p>
          <Choice<Target>
            label="When tapped, open"
            value={form.target}
            options={[
              { value: 'none', label: 'The inbox' },
              { value: 'session', label: 'A session' },
              { value: 'link', label: 'A web page' },
            ]}
            onChange={(v) => onChange('target', v)}
          />
          {form.target === 'session' && (
            <Field id={`${id}-s`} label="Session" error={errors.sessionId} className="mt-3">
              <Select id={`${id}-s`} value={form.sessionId} options={[{ value: '', label: 'Choose a session' }, ...sessions]} onChange={(v) => onChange('sessionId', v)} invalid={!!errors.sessionId} />
            </Field>
          )}
          {form.target === 'link' && (
            <Field id={`${id}-l`} label="Web address" error={errors.linkUrl} className="mt-3">
              <TextInput id={`${id}-l`} value={form.linkUrl} onChange={(e) => onChange('linkUrl', e.target.value)} placeholder="https://policycentre.org/communique" invalid={!!errors.linkUrl} maxLength={500} />
            </Field>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border bg-[#f6f6f6] px-6 py-3">
        <p className="text-xs text-[#7c7c7c]">A push cannot be recalled once it reaches phones.</p>
        <button type="submit" disabled={pending} className={buttonClass()}>
          <PaperAirplaneIcon className="size-4" />
          Send to {reach === 'event' ? `${audienceLabel({ segment: 'all', ticketTypeIds: form.ticketTypeIds }, new Map(tiers.map((t) => [t.id, t.name])))} at ${eventName}` : 'everyone on the app'}
        </button>
      </footer>
    </form>
  );
}

function SentRow({ n, now, sessionTitle, eventName, tierNames, onRetract }: { n: SentNotification; now: number; sessionTitle?: string; eventName?: string; tierNames: Map<string, string>; onRetract: () => void }) {
  const automatic = !isAnnouncement(n);
  return (
    <li className="flex gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs text-[#7c7c7c]">
          <Tag tone={automatic ? 'gray' : 'primary'}>{categoryLabel(n.category)}</Tag>
          {n.delegateId ? 'One delegate' : `To ${audienceLabel(n, tierNames)}${n.editionId ? ` at ${eventName ?? 'an event'}` : ' on the app'}`}
          <span>· {n.sentAt ? ago(n.sentAt, now).toLowerCase() : 'sending…'}</span>
          {n.whatsapp && <Tag tone="green">Also on WhatsApp</Tag>}
        </p>
        <p className="mt-1.5 text-[15px] text-ink">{n.title}</p>
        <p className="line-clamp-2 text-sm text-[#525252]">{n.body}</p>
        {(n.sessionId || n.linkUrl) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-primary">
            {n.linkUrl ? <ArrowTopRightOnSquareIcon className="size-3.5" /> : <CalendarDaysIcon className="size-3.5" />}
            <span className="truncate">Opens {n.linkUrl ?? sessionTitle ?? 'a session'}</span>
          </p>
        )}
      </div>
      {!automatic && (
        <button type="button" onClick={onRetract} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 shrink-0 hover:text-danger' })}>
          <TrashIcon className="size-4" />
          Retract
        </button>
      )}
    </li>
  );
}

/** Announcements for one event's delegates (or, from organisers, everyone), and the automatic pushes. */
export default function NotificationsPage() {
  const session = useSession();
  const page = usePageEdition();
  if (session.status !== 'signed-in' || !runsEvents(session.user.tier)) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <BellAlertIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">Announcements are sent by organisers</p>
      </div>
    );
  }
  const organiser = session.user.tier === 'admin';
  return <EventBar page={page}>{(editionId) => <NotificationsBoard edition={page.list.find((e) => e.id === editionId)!} organiser={organiser} />}</EventBar>;
}

function NotificationsBoard({ edition, organiser }: { edition: Edition; organiser: boolean }) {
  const [reach, setReach] = useState<Reach>('event');
  const sessions = useSessions(edition?.id);
  const sent = useSentNotifications();
  const { send, retract } = useNotificationActions();
  const mute = useMutedNotifications(edition?.id);
  const toast = useToast();
  const now = useNow(30_000).getTime();
  const [form, setForm] = useState<AnnouncementForm>(emptyAnnouncement);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState<AnnouncementBody | null>(null);
  const [retracting, setRetracting] = useState<SentNotification | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);
  const toEventNow = reach === 'event' || !organiser;
  const ticketTypes = useTicketTypes(edition?.id);
  const tiers = useMemo(() => (ticketTypes.data?.tiers ?? []).map((t) => ({ id: t.id, name: t.name })), [ticketTypes.data]);
  const tierNames = useMemo(() => new Map(tiers.map((t) => [t.id, t.name])), [tiers]);
  const waReach = useWhatsAppReach(toEventNow ? form.ticketTypeIds : [], toEventNow ? edition.id : undefined, whatsapp);

  const sessionOptions = useMemo(
    () => (sessions.data ?? []).filter((s) => s.type !== 'break').map((s) => ({ value: s.id, label: `Day ${s.day} · ${s.room} · ${s.title}` })),
    [sessions.data],
  );
  // this event's announcements, and those that went to everyone
  const shown = (sent.data ?? []).filter((n) => !n.editionId || n.editionId === edition.id);
  const titleOf = (id: string | null) => sessions.data?.find((s) => s.id === id)?.title;
  const muted = edition?.mutedNotifications ?? [];

  const change = <K extends keyof AnnouncementForm>(key: K, value: AnnouncementForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = announcementSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof AnnouncementForm] ??= issue.message;
      setErrors(next);
      return;
    }
    // an event organiser's announcements always go to their event's delegates
    const toEvent = reach === 'event' || !organiser;
    // tiers are the event's, so they only narrow an announcement to it
    const body = toAnnouncementBody(toEvent ? parsed.data : { ...parsed.data, ticketTypeIds: [] });
    setConfirming({ ...body, ...(toEvent ? { editionId: edition.id } : {}), ...(whatsapp ? { whatsapp: true } : {}) });
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Composer, then its preview, then history: on a phone the preview sits right under what it previews. */}
      <div className="min-w-0 lg:col-start-1">
        <Composer
          form={form}
          errors={errors}
          sessions={sessionOptions}
          pending={send.isPending}
          reach={organiser ? reach : 'event'}
          eventName={edition.shortName}
          tiers={tiers}
          canReachEveryone={organiser}
          onReach={setReach}
          onChange={change}
          onSubmit={submit}
        />
        <WhatsAppOption on={whatsapp} onChange={setWhatsapp} reach={waReach.data} loading={waReach.isPending && whatsapp} />
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">

        <PhonePreview title={form.title} body={form.body} />

        <section aria-labelledby="auto-title" className={cardClass}>
          <header className="border-b border-border px-5 py-3">
            <h2 id="auto-title" className="text-sm font-medium text-ink">
              Automatic pushes
            </h2>
            <p className="text-xs text-[#7c7c7c]">Sent by the app on its own{edition ? ` for ${edition.shortName}` : ''}.</p>
          </header>
          <ul className="divide-y divide-border">
            {AUTOMATIC.map((a) => {
              const on = !muted.includes(a.key);
              return (
                <li key={a.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div id={`auto-${a.key}`} className="min-w-0">
                    <p className="text-sm text-ink">{a.label}</p>
                    <p className="text-xs text-[#7c7c7c]">{a.hint}</p>
                  </div>
                  <Switch
                    checked={on}
                    labelledBy={`auto-${a.key}`}
                    disabled={!edition || mute.isPending}
                    onChange={(next) =>
                      mute.mutate(toggleMuted(muted, a.key, next), {
                        onError: (e) => toast.push({ title: 'Setting not saved', body: e.message, leading: { kind: 'icon', icon: BellAlertIcon, tone: 'danger' } }),
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="sent-title" className={cn(cardClass, 'min-w-0 lg:col-start-1')}>
          <header className="border-b border-border px-6 py-4">
            <h2 id="sent-title" className="text-base font-medium text-ink">
              Sent
            </h2>
            <p className="text-sm text-[#7c7c7c]">The latest 50, automatic pushes included.</p>
          </header>
          {sent.isPending ? (
            <div className="flex flex-col gap-3 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : sent.isError && !sent.data ? (
            <p role="alert" className="p-6 text-sm text-danger">
              {sent.error.message}
            </p>
          ) : shown.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-[#7c7c7c]">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((n) => (
                <SentRow key={n.id} n={n} now={now} sessionTitle={titleOf(n.sessionId)} eventName={edition.shortName} tierNames={tierNames} onRetract={() => setRetracting(n)} />
              ))}
            </ul>
          )}
      </section>

      <ConfirmDialog
        open={!!confirming}
        title={`Send to ${confirming ? (confirming.editionId ? `${audienceLabel({ segment: 'all', ticketTypeIds: confirming.ticketTypeIds }, tierNames)} at ${edition.shortName}` : 'everyone on the app') : ''}?`}
        confirmLabel="Send now"
        pendingLabel="Sending…"
        pending={send.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          confirming &&
          send.mutate(confirming, {
            onSuccess: () => {
              setConfirming(null);
              setForm(emptyAnnouncement());
              setWhatsapp(false);
              toast.push({ title: 'Sent', body: `“${confirming.title}” is on its way to phones.`, leading: { kind: 'icon', icon: PaperAirplaneIcon, tone: 'success' } });
            },
            onError: (e) => toast.push({ title: 'Not sent', body: e.message, leading: { kind: 'icon', icon: BellAlertIcon, tone: 'danger' } }),
          })
        }
      >
        “{confirming?.title}” goes to phones straight away and cannot be recalled from them. You can still remove it from the in-app inbox later.
        {confirming?.whatsapp && waReach.data ? ` It also goes on WhatsApp to ${waReach.data.recipients.toLocaleString('en-GB')} ${waReach.data.recipients === 1 ? 'delegate' : 'delegates'} who opted in${waReach.data.live ? ', charged per message' : ' (WhatsApp is not connected yet, so those are only logged)'}.` : ''}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!retracting}
        title="Retract this announcement?"
        confirmLabel="Retract"
        pendingLabel="Retracting…"
        pending={retract.isPending}
        tone="danger"
        onCancel={() => setRetracting(null)}
        onConfirm={() =>
          retracting &&
          retract.mutate(
            { id: retracting.id },
            {
              onSuccess: () => setRetracting(null),
              onError: (e) => toast.push({ title: 'Not retracted', body: e.message, leading: { kind: 'icon', icon: TrashIcon, tone: 'danger' } }),
            },
          )
        }
      >
        “{retracting?.title}” leaves every delegate’s inbox. Pushes already on phones stay there.
      </ConfirmDialog>
    </div>
  );
}

/**
 * "Also send on WhatsApp": off by default, since each WhatsApp message is charged. Shows how many
 * delegates in the audience opted in, and says plainly when WhatsApp is not connected yet.
 */
function WhatsAppOption({ on, onChange, reach, loading }: { on: boolean; onChange: (on: boolean) => void; reach: { recipients: number; live: boolean } | undefined; loading: boolean }) {
  return (
    <section aria-labelledby="wa-title" className={cn(cardClass, 'mt-5 flex items-start justify-between gap-4 px-6 py-4')}>
      <div className="min-w-0">
        <h2 id="wa-title" className="text-sm font-medium text-ink">
          Also send on WhatsApp
        </h2>
        <p className="text-xs text-[#7c7c7c]">
          {!on
            ? 'To delegates in this audience who opted in to WhatsApp updates. Each message is charged.'
            : loading || !reach
              ? 'Counting who opted in…'
              : reach.recipients === 0
                ? 'Nobody in this audience has opted in yet, so only the app gets it.'
                : `${reach.recipients.toLocaleString('en-GB')} ${reach.recipients === 1 ? 'delegate has' : 'delegates have'} opted in.${reach.live ? ' Each message is charged.' : ' WhatsApp is not connected on the server yet: messages are logged, not sent.'}`}
        </p>
      </div>
      <Switch checked={on} onChange={onChange} labelledBy="wa-title" />
    </section>
  );
}
