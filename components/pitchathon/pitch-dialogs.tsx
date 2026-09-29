'use client';

import { LightBulbIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { useId, useState } from 'react';

import { FormDialog } from '@/components/ui/form-dialog';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { emptyPitch, pitchFormOf, pitchSchema, topicSchema, type PitchEntry, type PitchForm } from '@/lib/pitchathon/pitchathon';
import { sessionTrackOptions, trackLabel } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { cn } from '@/lib/utils';

/** Name a topic, or rename one. */
export function TopicDialog({
  open,
  name: initial,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The current name when renaming; null for a new topic. */
  name: string | null;
  pending: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);
  if (open && openedFor !== initial) {
    setOpenedFor(initial);
    setName(initial ?? '');
    setProblem(undefined);
  }
  return (
    <FormDialog
      open={open}
      icon={RectangleStackIcon}
      title={initial === null ? 'New topic' : 'Rename topic'}
      subtitle="A topic is one ballot: its pitches present, then the room votes."
      pending={pending}
      submitLabel={initial === null ? 'Create topic' : 'Save'}
      error={error}
      onClose={() => {
        setOpenedFor(undefined);
        onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = topicSchema.safeParse({ name });
        if (!parsed.success) setProblem(parsed.error.issues[0]!.message);
        else onSave(parsed.data.name);
      }}
    >
      <Field id={id} label="Name" error={problem} hint="As announced on stage, for example “Financial inclusion”.">
        <TextInput
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(undefined);
          }}
          invalid={!!problem}
          maxLength={160}
          aria-describedby={describedBy(id, problem, 'hint')}
          autoFocus
        />
      </Field>
    </FormDialog>
  );
}

type PitchErrors = Partial<Record<keyof PitchForm, string>>;

/** Add a pitch to a topic, or edit one. */
/** Every active track and General Programme, plus the pitch's own if it has since been retired. */
function pitchTracks(library: Parameters<typeof sessionTrackOptions>[0], current: string) {
  const options = sessionTrackOptions(library, undefined);
  return options.some((o) => o.value === current) ? options : [...options, { value: current, label: trackLabel(current, library) }];
}

export function PitchDialog({
  open,
  pitch,
  topicName,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  pitch: PitchEntry | null;
  topicName: string;
  pending: boolean;
  error: string | null;
  onSave: (form: PitchForm) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const [form, setForm] = useState<PitchForm>(emptyPitch);
  const trackLibrary = useTrackLibrary();
  const [errors, setErrors] = useState<PitchErrors>({});
  const [openedFor, setOpenedFor] = useState<PitchEntry | null | undefined>(undefined);
  if (open && openedFor !== pitch) {
    setOpenedFor(pitch);
    setForm(pitch ? pitchFormOf(pitch) : emptyPitch());
    setErrors({});
  }
  const set = <K extends keyof PitchForm>(key: K, value: PitchForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <FormDialog
      open={open}
      icon={LightBulbIcon}
      title={pitch ? 'Edit pitch' : 'Add pitch'}
      subtitle={`In “${topicName}”.`}
      pending={pending}
      submitLabel={pitch ? 'Save pitch' : 'Add pitch'}
      error={error}
      onClose={() => {
        setOpenedFor(undefined);
        onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = pitchSchema.safeParse(form);
        if (!parsed.success) {
          const next: PitchErrors = {};
          for (const issue of parsed.error.issues) next[issue.path[0] as keyof PitchForm] ??= issue.message;
          setErrors(next);
          return;
        }
        onSave(parsed.data);
      }}
    >
      <Field id={id('name')} label="Innovator or team" error={errors.innovatorName}>
        <TextInput
          id={id('name')}
          value={form.innovatorName}
          onChange={(e) => set('innovatorName', e.target.value)}
          placeholder="SafeRide"
          invalid={!!errors.innovatorName}
          maxLength={255}
          aria-describedby={describedBy(id('name'), errors.innovatorName)}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('country')} label="Country" error={errors.country}>
          <TextInput
            id={id('country')}
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
            placeholder="Ghana"
            invalid={!!errors.country}
            maxLength={100}
            aria-describedby={describedBy(id('country'), errors.country)}
          />
        </Field>
        <Field id={id('track')} label="Track">
          <Select id={id('track')} value={form.track} options={pitchTracks(trackLibrary.data ?? [], form.track)} onChange={(track) => set('track', track)} />
        </Field>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor={id('description')} className="text-sm text-ink">
            What it is
          </label>
          <span className="text-xs tabular-nums text-[#7c7c7c]">{form.description.trim().length}/600</span>
        </div>
        <textarea
          id={id('description')}
          rows={4}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Women-only night buses in Accra, booked and tracked by SMS."
          maxLength={600}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? id('description-error') : id('description-hint')}
          className={cn(
            'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm leading-5 text-ink shadow-xs outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
            errors.description ? 'border-danger' : 'border-[#bdbdbd]',
          )}
        />
        {errors.description ? (
          <p id={id('description-error')} className="mt-1 text-xs text-danger">
            {errors.description}
          </p>
        ) : (
          <p id={id('description-hint')} className="mt-1 text-xs text-[#7c7c7c]">
            Delegates read this on the ballot, so one or two plain sentences.
          </p>
        )}
      </div>
    </FormDialog>
  );
}
