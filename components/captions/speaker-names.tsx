'use client';

import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon, PlusIcon, UserGroupIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import {
  bindingLabel,
  DEFAULT_SPEAKER_NAMING,
  isApplied,
  isHeard,
  isSuggested,
  SPEAKER_NAMING_OPTIONS,
  useRecheckNames,
  useSpeakerNames,
  voices,
  type NameChange,
  type SpeakerName,
  type SpeakerNaming,
} from '@/lib/captions/speaker-names';
import { useUpdateEdition } from '@/lib/events/use-editions';
import { useWorkingEdition } from '@/lib/events/working-edition';
import type { Session, Speaker } from '@/lib/programme/programme';
import { useListMotion } from '@/lib/use-list-motion';
import { cn } from '@/lib/utils';

/** "Chidi Okoro (Paystack)". */
const nameWithOrg = (b: Pick<SpeakerName, 'name' | 'organisation'>) => (b.organisation ? `${b.name} (${b.organisation})` : b.name);

/** Marks a name learnt from what was said; the line it was heard in is the tooltip. */
export function HeardTag({ binding, className }: { binding: SpeakerName; className?: string }) {
  if (!isHeard(binding)) return null;
  return (
    <span title={binding.evidence ? `Heard: “${binding.evidence}”` : 'Heard in an introduction'} className={cn('inline-flex', className)}>
      <Tag tone="primary">Heard</Tag>
    </span>
  );
}

/* ------------------------------------------------------------- suggestions */

/**
 * Voices that introduced themselves but are not on the programme, waiting for the operator's
 * yes or no, for every live session given. Nothing is named until someone here says so.
 */
export function SuggestionsStrip({ sessions, className }: { sessions: Session[]; className?: string }) {
  return (
    <div aria-live="polite" className={cn('flex flex-col gap-3 empty:hidden', className)}>
      {sessions.map((s) => (
        <SessionSuggestions key={s.id} session={s} showRoom={sessions.length > 1} />
      ))}
    </div>
  );
}

function SessionSuggestions({ session, showRoom }: { session: Session; showRoom: boolean }) {
  const names = useSpeakerNames(session.id);
  const listRef = useListMotion<HTMLUListElement>();
  if (names.suggested.length === 0) return null;
  return (
    <ul ref={listRef} className="flex flex-col gap-3" aria-label={`Suggested names, ${session.room}`}>
      {names.suggested.map((b) => (
        <SuggestionCard key={b.id} binding={b} room={showRoom ? session.room : null} names={names} />
      ))}
    </ul>
  );
}

function SuggestionCard({ binding, room, names }: { binding: SpeakerName; room: string | null; names: ReturnType<typeof useSpeakerNames> }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const busy = names.pendingId === binding.id;
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } });
  return (
    <li className="pop-in rounded-xl bg-primary-soft px-4 py-3 text-sm text-ink">
      <p>
        {room && <span className="text-hint">{room} · </span>}
        <span className="font-medium">{bindingLabel(binding)}</span> said they are <span className="font-medium">{nameWithOrg(binding)}</span>
        {binding.evidence && <span className="text-ink-soft">: “{binding.evidence.replace(/[.!]+$/, '')}”</span>}. Name them?
      </p>
      {editing ? (
        <VoiceForm
          className="mt-3"
          initial={{ name: binding.name, organisation: binding.organisation ?? '', speakerId: binding.speakerId ?? '' }}
          submitLabel="Name them"
          pending={busy}
          onCancel={() => setEditing(false)}
          onSubmit={(change) => names.confirm(binding.id, change).catch(fail('Name not saved'))}
        />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void names.confirm(binding.id).catch(fail('Name not saved'))} className={buttonClass({ className: 'h-8' })}>
            <CheckIcon className="size-4" />
            Yes
          </button>
          <button type="button" disabled={busy} onClick={() => void names.reject(binding.id).catch(fail('Not saved'))} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
            No
          </button>
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
            Edit
          </button>
        </div>
      )}
    </li>
  );
}

/* ----------------------------------------------------------------- recheck */

/** Runs the introductions over a completed session's transcript again and says what changed. */
export function RecheckNamesButton({ sessionId, className }: { sessionId: string; className?: string }) {
  const recheck = useRecheckNames(sessionId);
  const toast = useToast();
  const run = () =>
    recheck.mutate(undefined, {
      onSuccess: ({ added, changed }) => toast.push({ title: 'Names rechecked', body: `${added} added, ${changed} changed.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } }),
      onError: (e) => toast.push({ title: 'Names not rechecked', body: e.message, leading: { kind: 'icon', icon: ExclamationTriangleIcon, tone: 'danger' } }),
    });
  return (
    <button type="button" onClick={run} disabled={recheck.isPending} className={buttonClass({ style: 'outline', color: 'gray', className })}>
      <ArrowPathIcon className={cn('size-4', recheck.isPending && 'motion-safe:animate-spin')} />
      {recheck.isPending ? 'Rechecking…' : 'Recheck names'}
    </button>
  );
}

/* ----------------------------------------------------------------- setting */

/** The working event's rule for naming voices from introductions, saved as soon as it is picked. */
export function NamingSetting() {
  const { edition } = useWorkingEdition();
  const save = useUpdateEdition();
  const toast = useToast();
  const id = useId();
  const value = edition?.speakerNaming ?? DEFAULT_SPEAKER_NAMING;
  const change = (speakerNaming: SpeakerNaming) => {
    if (!edition || speakerNaming === value) return;
    save.mutate(
      { id: edition.id, body: { speakerNaming } },
      {
        onSuccess: () =>
          toast.push({
            title: 'Speaker naming saved',
            body: SPEAKER_NAMING_OPTIONS.find((o) => o.value === speakerNaming)?.label,
            leading: { kind: 'icon', icon: CheckIcon, tone: 'success' },
          }),
        onError: (e) => toast.push({ title: 'Setting not saved', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
      },
    );
  };
  return (
    <section aria-label="Speaker naming" className="card-art flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-6 py-4">
      <div className="min-w-0 max-w-2xl">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Name speakers from introductions
        </label>
        <p className="mt-0.5 text-xs text-hint">
          When someone says who they are, captions can carry their name. Programmed speakers are named at once; anyone else is only suggested here, and named when an operator confirms. Off leaves
          every voice as “Speaker 2” unless named in Mics.
        </p>
      </div>
      <Select id={id} value={value} options={SPEAKER_NAMING_OPTIONS} onChange={change} className={cn('w-full sm:w-64', save.isPending && 'opacity-60')} />
    </section>
  );
}

/* --------------------------------------------------------------------- mics */

/** Under a mic's name field: what the voice on it was heard to be, and a button to take that name. */
export function MicHeard({ heard, named, onUse }: { heard: SpeakerName | null; named: boolean; onUse: (b: SpeakerName) => void }) {
  if (!heard) return named ? <p className="text-xs text-hint">Named by operator</p> : null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-hint">
      <span title={heard.evidence ? `“${heard.evidence}”` : undefined}>
        Heard: <span className="text-ink">{nameWithOrg(heard)}</span>
      </span>
      {named ? (
        <span>· Named by operator</span>
      ) : (
        <>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => onUse(heard)} className="text-primary hover:underline">
            Use
          </button>
        </>
      )}
    </p>
  );
}

/* ------------------------------------------------------------------- voices */

type VoiceFields = { name: string; organisation: string; speakerId: string };
const SOMEONE_ELSE = '';

/** Name and organisation, with the session's programmed speakers to pick from (filling both in). */
function VoiceForm({
  initial,
  speakers = [],
  number,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  className,
}: {
  initial: VoiceFields;
  speakers?: Speaker[];
  /** Offered when naming a new voice: which speaker number. */
  number?: { value: number; options: number[]; onChange: (n: number) => void };
  submitLabel: string;
  pending: boolean;
  onSubmit: (change: NameChange & { name: string }) => void;
  onCancel: () => void;
  className?: string;
}) {
  const id = useId();
  const [fields, setFields] = useState<VoiceFields>(initial);
  const picker = speakers.length > 0;
  const pick = (speakerId: string) => {
    const s = speakers.find((x) => x.id === speakerId);
    setFields(s ? { name: s.name, organisation: s.organisation ?? '', speakerId: s.id } : { ...fields, speakerId: SOMEONE_ELSE });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = fields.name.trim();
    if (!name) return;
    onSubmit({ name, organisation: fields.organisation.trim() || null, speakerId: fields.speakerId || null });
  };
  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-3', className)}>
      <div className={cn('grid gap-3', picker ? 'sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]')}>
        {number && (
          <Field id={`${id}-number`} label="Voice">
            <Select
              id={`${id}-number`}
              value={String(number.value)}
              options={number.options.map((n) => ({ value: String(n), label: `Speaker ${n}` }))}
              onChange={(v) => number.onChange(Number(v))}
              className="w-32"
            />
          </Field>
        )}
        {picker && (
          <Field id={`${id}-speaker`} label="On the programme">
            <Select
              id={`${id}-speaker`}
              value={fields.speakerId}
              options={[{ value: SOMEONE_ELSE, label: 'Someone else' }, ...speakers.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={pick}
            />
          </Field>
        )}
        <Field id={`${id}-name`} label="Name">
          <TextInput id={`${id}-name`} value={fields.name} maxLength={80} required autoFocus onChange={(e) => setFields({ ...fields, name: e.target.value })} />
        </Field>
        <Field id={`${id}-org`} label="Organisation" optional>
          <TextInput id={`${id}-org`} value={fields.organisation} maxLength={80} onChange={(e) => setFields({ ...fields, organisation: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || !fields.name.trim()} className={buttonClass({ className: 'h-8' })}>
          <CheckIcon className="size-4" />
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The most speaker numbers offered when naming a voice by hand. */
const MAX_VOICES = 12;

/**
 * A session's voices, for rooms captured on one channel with speaker separation: each diarised
 * speaker that has a name (heard or typed in) or a suggestion, to confirm, rename or remove,
 * and a form to name one by hand.
 */
export function VoicesPanel({ session }: { session: Session }) {
  const names = useSpeakerNames(session.id);
  const toast = useToast();
  const listRef = useListMotion<HTMLUListElement>();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = voices(names.bindings);
  const taken = new Set(list.filter(isApplied).map((b) => b.key + 1));
  const numbers = Array.from({ length: MAX_VOICES }, (_, i) => i + 1);
  const [number, setNumber] = useState(() => numbers.find((n) => !taken.has(n)) ?? 1);
  const fail = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } });

  return (
    <Panel
      size="compact"
      title="Voices"
      count={list.length}
      description="Who each voice is, where the room is captured on one channel with speakers told apart."
      actions={
        !adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PlusIcon className="size-4" />
            Name a voice
          </button>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        {adding && (
          <VoiceForm
            initial={{ name: '', organisation: '', speakerId: SOMEONE_ELSE }}
            speakers={session.speakers}
            number={{ value: number, options: numbers, onChange: setNumber }}
            submitLabel="Name the voice"
            pending={names.pending}
            onCancel={() => setAdding(false)}
            onSubmit={(change) =>
              names
                .name({ kind: 'speaker', key: number - 1, ...change })
                .then(() => setAdding(false))
                .catch(fail('Voice not named'))
            }
          />
        )}
        {list.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-hint">
            <UserGroupIcon className="size-4" /> No voice is named yet. Names are learnt as people introduce themselves, or typed in here.
          </p>
        ) : (
          <ul ref={listRef} className="divide-y divide-border">
            {list.map((b) => {
              const busy = names.pendingId === b.id;
              return (
                <li key={b.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  {editing === b.id ? (
                    <VoiceForm
                      initial={{ name: b.name, organisation: b.organisation ?? '', speakerId: b.speakerId ?? '' }}
                      speakers={session.speakers}
                      submitLabel="Save name"
                      pending={busy}
                      onCancel={() => setEditing(null)}
                      onSubmit={(change) => (isSuggested(b) ? names.confirm(b.id, change) : names.rename(b.id, change)).then(() => setEditing(null)).catch(fail('Name not saved'))}
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-hint">{bindingLabel(b)}</span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="text-ink">{b.name}</span>
                        {b.organisation && <span className="text-hint">· {b.organisation}</span>}
                        {isSuggested(b) ? <Tag tone="gold">Suggested</Tag> : isHeard(b) ? <HeardTag binding={b} /> : <Tag>Named by operator</Tag>}
                      </div>
                      {isSuggested(b) && (
                        <div className="flex items-center gap-1">
                          <button type="button" disabled={busy} onClick={() => void names.confirm(b.id).catch(fail('Name not saved'))} className={buttonClass({ style: 'soft', className: 'h-8' })}>
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void names.reject(b.id).catch(fail('Not saved'))}
                            className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}
                          >
                            No
                          </button>
                        </div>
                      )}
                      <RowActions name={`${bindingLabel(b)}, ${b.name}`} onEdit={() => setEditing(b.id)} onDelete={() => void names.remove(b.id).catch(fail('Name not removed'))} />
                    </div>
                  )}
                  {b.evidence && editing !== b.id && <p className="pl-23 text-xs text-hint">“{b.evidence}”</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
