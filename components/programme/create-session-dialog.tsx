'use client';

import { CheckCircleIcon, ClockIcon, DocumentTextIcon, MapPinIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { sessionTrackOptions } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { QUARTER_HOURS } from '@/lib/calendar';
import type { Edition } from '@/lib/events/events';
import {
  createSessionSchema,
  dayDate,
  MAX_DAY,
  SESSION_TYPES,
  sessionToForm,
  toSessionBody,
  TYPE_LABEL,
  type CreateSessionForm,
  type Session,
} from '@/lib/programme/programme';
import { useCreateSession, useUpdateSession } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

type Errors = Partial<Record<keyof CreateSessionForm, string>>;

const TYPE_OPTIONS = SESSION_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }));
const TIME_OPTIONS = QUARTER_HOURS.map((t) => ({ value: t, label: t }));

const blank = (day: number): Omit<CreateSessionForm, 'date'> => ({
  title: '',
  description: '',
  type: 'panel',
  track: 'general',
  day,
  startTime: '09:00',
  endTime: '10:00',
  room: '',
});

/** Same section layout as "Add event": the group's name on the left, its fields on the right. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#7c7c7c]">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * "Add session": a modal form for one programme slot in an edition. The day is picked from the
 * edition's own dates (the API takes day 1 or 2), times in 15-minute steps. Speakers are added
 * from the session once it exists.
 */
export function CreateSessionDialog({ open, onClose, edition, day, session = null }: { open: boolean; onClose: () => void; edition: Edition; day: number; /** Set to edit this session instead of adding one. */ session?: Session | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [form, setForm] = useState(() => blank(day));
  const [errors, setErrors] = useState<Errors>({});
  const create = useCreateSession(edition.id);
  const update = useUpdateSession(edition.id);
  const pending = create.isPending || update.isPending;
  const failed = session ? update.error : create.error;
  // this event's tracks, then General Programme
  const trackOptions = sessionTrackOptions(useTrackLibrary().data ?? [], edition.trackValues);
  const toast = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Opening from a day tab starts the form on that day.
  const [openedFor, setOpenedFor] = useState(day);
  if (open && !session && openedFor !== day) {
    setOpenedFor(day);
    setForm((was) => ({ ...was, day }));
  }
  // Editing: start from the session's own values each time it is opened for one.
  const [editingId, setEditingId] = useState<string | null>(null);
  if (open && session && editingId !== session.id) {
    setEditingId(session.id);
    setForm(sessionToForm(session));
    setErrors({});
  }

  const finish = () => {
    setForm(blank(day));
    setErrors({});
    create.reset();
    update.reset();
    setEditingId(null);
    onClose();
  };
  const close = () => {
    if (!pending) finish();
  };
  const set = <K extends keyof CreateSessionForm>(key: K, value: CreateSessionForm[K]) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const parsed = createSessionSchema.safeParse({ ...form, date: dayDate(edition.startsAt, form.day) });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof CreateSessionForm] ??= issue.message;
      setErrors(next);
      return;
    }
    if (session) {
      const { editionId: _edition, ...body } = toSessionBody(parsed.data, edition.id);
      void _edition;
      update.mutate(
        { session, body },
        {
          onSuccess: (saved) => {
            finish();
            toast.push({ title: 'Session saved', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${saved.title ?? body.title} is up to date in the programme and the app.` });
          },
        },
      );
      return;
    }
    create.mutate(toSessionBody(parsed.data, edition.id), {
      onSuccess: (created) => {
        finish();
        toast.push({
          title: 'Session added',
          leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' },
          body: `${created.title} is on Day ${created.day} of the programme.`,
        });
      },
    });
  };

  const id = (name: string) => `${baseId}-${name}`;
  const dayOptions = Array.from({ length: MAX_DAY }, (_, i) => {
    const n = i + 1;
    const date = new Date(`${dayDate(edition.startsAt, n)}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return { value: String(n), label: `Day ${n} · ${date}` };
  });

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('heading')}
      aria-describedby={id('subtitle')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('lg')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={ClockIcon}
            title={session ? 'Edit session' : 'Add session'}
            titleId={id('heading')}
            subtitle={session ? `In the ${edition.shortName} programme. Delegates are told if the time or room changes.` : `A slot in the ${edition.shortName} programme. Add speakers once it is saved.`}
            subtitleId={id('subtitle')}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">
          <Section title="Details" description="What delegates see in the app's schedule.">
            <Field id={id('title')} label="Title" error={errors.title} className="sm:col-span-2">
              <TextInput
                id={id('title')}
                icon={MicrophoneIcon}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Opening plenary: inclusion that scales"
                invalid={!!errors.title}
                aria-describedby={describedBy(id('title'), errors.title)}
                autoFocus
              />
            </Field>
            <Field id={id('description')} label="Description" error={errors.description} className="sm:col-span-2">
              <div
                className={cn(
                  'flex gap-1.5 rounded-lg border bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow',
                  errors.description
                    ? 'border-danger focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_var(--danger-soft)]'
                    : 'border-[#bdbdbd] focus-within:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                )}
              >
                <DocumentTextIcon className="mt-px size-5 shrink-0 text-[#525252]" />
                <textarea
                  id={id('description')}
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Welcome and framing for the two days."
                  aria-invalid={!!errors.description || undefined}
                  aria-describedby={describedBy(id('description'), errors.description)}
                  className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-[#525252] outline-none placeholder:text-placeholder"
                />
              </div>
            </Field>
            <Field id={id('type')} label="Format">
              <Select id={id('type')} value={form.type} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
            </Field>
            <Field id={id('track')} label="Track">
              <Select id={id('track')} value={form.track} options={trackOptions} onChange={(v) => set('track', v)} />
            </Field>
          </Section>

          <Section title="When & where" description="The day, the slot in 15-minute steps, and the room captions are routed to.">
            <Field id={id('day')} label="Day" className="sm:col-span-2">
              <Select id={id('day')} value={String(form.day)} options={dayOptions} onChange={(v) => set('day', Number(v))} />
            </Field>
            <Field id={id('startTime')} label="Starts at">
              <Select id={id('startTime')} value={form.startTime} options={TIME_OPTIONS} onChange={(v) => set('startTime', v)} />
            </Field>
            <Field id={id('endTime')} label="Ends at" error={errors.endTime}>
              <Select
                id={id('endTime')}
                value={form.endTime}
                options={TIME_OPTIONS}
                onChange={(v) => set('endTime', v)}
                invalid={!!errors.endTime}
                describedBy={describedBy(id('endTime'), errors.endTime)}
              />
            </Field>
            <Field id={id('room')} label="Room" error={errors.room} className="sm:col-span-2">
              <TextInput
                id={id('room')}
                icon={MapPinIcon}
                value={form.room}
                onChange={(e) => set('room', e.target.value)}
                placeholder="Main Hall"
                invalid={!!errors.room}
                help="Use the room's real name: live captions are sent to it."
                aria-describedby={describedBy(id('room'), errors.room)}
              />
            </Field>
          </Section>

          {failed && (
            <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {failed.message}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass()}>
            {update.isPending ? 'Saving…' : create.isPending ? 'Adding…' : session ? 'Save changes' : 'Add session'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
