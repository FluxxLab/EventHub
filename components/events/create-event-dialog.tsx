'use client';

import { BuildingOffice2Icon, CalendarDaysIcon, CheckCircleIcon, ExclamationTriangleIcon, EyeSlashIcon, HashtagIcon, MapPinIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { brandingUnchanged, EventBrandingFields } from '@/components/events/event-branding';
import { defaultTopics, EventTopicsFields } from '@/components/events/event-topics';
import { buttonClass } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { HALF_HOURS, type DayRange } from '@/lib/calendar';
import { categoryLabel, createEditionSchema, EDITION_CATEGORIES, editionToForm, toCreateBody, toUpdateBody, type CreateEditionForm, type Edition } from '@/lib/events/events';
import { useInterestLibrary, useTrackLibrary, type EditionTopics } from '@/lib/catalog/use-topics';
import { useCreateEdition, useSaveBranding, useUpdateEdition, type BrandingChange } from '@/lib/events/use-editions';

const EMPTY: CreateEditionForm = { name: '', shortName: '', startsAt: '', endsAt: '', venue: '', city: '', category: 'summits' };
const NO_RANGE: DayRange = { start: '', end: '' };
/** A typical event day, so most organisers only pick the dates. */
const DEFAULT_TIMES = { start: '09:00', end: '17:00' };

const CATEGORY_OPTIONS = EDITION_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }));
const TIME_OPTIONS = HALF_HOURS.map((t) => ({ value: t, label: t }));

type Errors = Partial<Record<keyof CreateEditionForm, string>>;

/** One group of the form: its name and a line of context on the left, its fields on the right. */
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
 * "Add event": a modal form for a new edition, in three sections (details, schedule, location).
 * The days come from a range picker and the times from two dropdowns; they are joined into
 * startsAt / endsAt and checked before sending. It stays open with the server's reason if the
 * create fails, and closes once the edition exists (as a draft). Branding (picture, logo, button
 * colour) is sent after the create, since uploads are signed per event; if that part fails the
 * event still exists and the toast says to finish it from the Events table.
 */
export function CreateEventDialog({ open, onClose, edition = null }: { open: boolean; onClose: () => void; /** Set to edit this event instead of adding one. */ edition?: Edition | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [form, setForm] = useState<CreateEditionForm>(EMPTY);
  const [range, setRange] = useState<DayRange>(NO_RANGE);
  const [times, setTimes] = useState(DEFAULT_TIMES);
  const [errors, setErrors] = useState<Errors>({});
  // null until the organiser changes a pick: the event then gets every active track and interest
  const [topics, setTopics] = useState<EditionTopics | null>(null);
  const trackLibrary = useTrackLibrary();
  const interestLibrary = useInterestLibrary();
  const create = useCreateEdition();
  const saveBranding = useSaveBranding();
  const [branding, setBranding] = useState<BrandingChange>({});
  const [step, setStep] = useState<string | null>(null);
  const toast = useToast();
  const update = useUpdateEdition();
  const busy = create.isPending || saveBranding.isPending || update.isPending;

  // Editing: start from the event's own values each time it is opened for one.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (open && edition && openedFor !== edition.id) {
    const start = editionToForm(edition);
    setOpenedFor(edition.id);
    setForm(start.form);
    setRange(start.range);
    setTimes(start.times);
    setErrors({});
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const finish = () => {
    setForm(EMPTY);
    setRange(NO_RANGE);
    setTimes(DEFAULT_TIMES);
    setErrors({});
    setTopics(null);
    setBranding({});
    setStep(null);
    create.reset();
    saveBranding.reset();
    update.reset();
    setOpenedFor(null);
    onClose();
  };
  /** Cancel or Escape: ignored while the create is in flight. */
  const close = () => {
    if (!busy) finish();
  };

  const clear = (...keys: (keyof CreateEditionForm)[]) => {
    if (keys.some((k) => errors[k])) setErrors((was) => ({ ...was, ...Object.fromEntries(keys.map((k) => [k, undefined])) }));
  };
  const set = <K extends keyof CreateEditionForm>(key: K, value: CreateEditionForm[K]) => {
    setForm((was) => ({ ...was, [key]: value }));
    clear(key);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = createEditionSchema.safeParse({
      ...form,
      startsAt: range.start ? `${range.start}T${times.start}` : '',
      endsAt: range.end ? `${range.end}T${times.end}` : '',
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof CreateEditionForm] ??= issue.message;
      setErrors(next);
      return;
    }
    if (edition) {
      update.mutate(
        { id: edition.id, body: toUpdateBody(parsed.data) },
        {
          onSuccess: () => {
            finish();
            toast.push({ title: 'Event saved', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${parsed.data.name} is up to date in the console and the app.` });
          },
        },
      );
      return;
    }
    // sent only once the lists have loaded; otherwise the API gives it every active one anyway
    const picks = topics ?? (trackLibrary.data && interestLibrary.data ? defaultTopics(trackLibrary.data, interestLibrary.data) : null);
    create.mutate({ ...toCreateBody(parsed.data), ...(picks ?? {}) }, {
      onSuccess: (created) => {
        const added = () =>
          toast.push({
            title: 'Event added',
            leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' },
            body: `${created.name} is saved as a draft. Delegates will not see it until you announce it.`,
          });
        if (brandingUnchanged(branding)) {
          finish();
          return added();
        }
        saveBranding.mutate(
          { editionId: created.id, change: branding, onProgress: setStep },
          {
            onSuccess: () => {
              finish();
              added();
            },
            onError: (error) => {
              finish();
              toast.push({
                title: 'Event added, branding not saved',
                leading: { kind: 'icon', icon: ExclamationTriangleIcon, tone: 'danger' },
                body: `${created.name} is saved as a draft, but ${error.message.replace(/\.$/, '').toLowerCase()}. Add the picture, logo and colour from Branding in the Events table.`,
              });
            },
          },
        );
      },
    });
  };

  const id = (name: string) => `${baseId}-${name}`;
  // The dates field carries either end's message: a missing day, or an end before the start.
  const datesError = errors.startsAt ?? errors.endsAt;
  // ApiError carries the server's plain-English reason; NetworkError says what to check.
  const serverError = (edition ? update.error : create.error)?.message ?? null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('title')}
      aria-describedby={id('subtitle')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('lg')}
    >
      {/* Header and footer stay put; only the sections between them scroll. */}
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={CalendarDaysIcon}
            title={edition ? 'Edit event' : 'Add event'}
            titleId={id('title')}
            subtitle={edition ? `${edition.name}: its name, dates and place. Branding and tracks have their own buttons in the Events table.` : 'The essentials to create it, and how it looks in the app. Tickets and sessions come after.'}
            subtitleId={id('subtitle')}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">
          <Section title="Details" description="How the event is named in the console, the app and on tickets.">
            <Field id={id('name')} label="Event name" error={errors.name} className="sm:col-span-2">
              <TextInput
                id={id('name')}
                icon={SparklesIcon}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="GS-27 Gender and Inclusion Summit"
                invalid={!!errors.name}
                aria-describedby={describedBy(id('name'), errors.name)}
                autoFocus
              />
            </Field>
            <Field id={id('shortName')} label="Short name" error={errors.shortName}>
              <TextInput
                id={id('shortName')}
                icon={HashtagIcon}
                value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
                placeholder="GS-27"
                invalid={!!errors.shortName}
                help="Shown on badges, tickets and anywhere space is tight."
                aria-describedby={describedBy(id('shortName'), errors.shortName)}
              />
            </Field>
            <Field id={id('category')} label="Category">
              <Select id={id('category')} value={form.category} options={CATEGORY_OPTIONS} onChange={(v) => set('category', v)} />
            </Field>
          </Section>

          <Section title="Schedule" description="Pick the first and last day, then the daily start and end times.">
            <Field id={id('dates')} label="Dates" error={datesError} className="sm:col-span-2">
              <DateRangePicker
                id={id('dates')}
                value={range}
                onChange={(next) => {
                  setRange(next);
                  clear('startsAt', 'endsAt');
                }}
                invalid={!!datesError}
                describedBy={describedBy(id('dates'), datesError)}
              />
            </Field>
            <Field id={id('startTime')} label="Starts at">
              <Select
                id={id('startTime')}
                value={times.start}
                options={TIME_OPTIONS}
                onChange={(v) => {
                  setTimes((t) => ({ ...t, start: v }));
                  clear('endsAt');
                }}
              />
            </Field>
            <Field id={id('endTime')} label="Ends at">
              <Select
                id={id('endTime')}
                value={times.end}
                options={TIME_OPTIONS}
                onChange={(v) => {
                  setTimes((t) => ({ ...t, end: v }));
                  clear('endsAt');
                }}
              />
            </Field>
          </Section>

          <Section title="Location" description="Where delegates go. You can add the address and map pin later.">
            <Field id={id('venue')} label="Venue" optional error={errors.venue}>
              <TextInput
                id={id('venue')}
                icon={BuildingOffice2Icon}
                value={form.venue}
                onChange={(e) => set('venue', e.target.value)}
                placeholder="Transcorp Hilton"
                invalid={!!errors.venue}
                aria-describedby={describedBy(id('venue'), errors.venue)}
              />
            </Field>
            <Field id={id('city')} label="City" optional error={errors.city}>
              <TextInput
                id={id('city')}
                icon={MapPinIcon}
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Abuja"
                invalid={!!errors.city}
                aria-describedby={describedBy(id('city'), errors.city)}
              />
            </Field>
          </Section>

          {!edition && (
            <>
          <Section title="Branding" description="How the event looks in the app. All optional; change them any time from the Events table.">
            <EventBrandingFields id={id('branding')} current={{ name: form.name, shortName: form.shortName }} value={branding} onChange={setBranding} />
          </Section>

          <Section title="Tracks and interests" description="Picked from the shared lists. Change them any time from the Events table.">
            <EventTopicsFields id={id('topics')} value={topics} onChange={setTopics} />
          </Section>
            </>
          )}

          {serverError && (
            <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}
        </div>

        <div className="shrink-0 px-6 pb-6 pt-4">
          {!edition && (
            <p className="mb-3 flex items-center gap-2 text-xs text-[#7c7c7c]">
              <EyeSlashIcon className="size-4 shrink-0" />
              Saved as a draft, hidden from delegates until you announce it.
            </p>
          )}
          <ModalActions className="pt-0">
            <button type="button" onClick={close} disabled={busy} className={cancelClass}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass()}>
              {update.isPending ? 'Saving…' : create.isPending ? 'Adding…' : saveBranding.isPending ? (step ?? 'Saving the branding…') : edition ? 'Save changes' : 'Add event'}
            </button>
          </ModalActions>
        </div>
      </form>
    </dialog>
  );
}
