'use client';

import { MegaphoneIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EMPTY_FORM, formProblem, toBody, toForm, TYPE_LABEL, type CallToAction, type CallToActionForm } from '@/lib/calls-to-action/calls-to-action';

const textarea =
  'w-full rounded-lg border border-[#bdbdbd] bg-surface px-3 py-2.5 text-sm leading-6 text-ink shadow-xs outline-none placeholder:text-placeholder focus:border-primary';

/**
 * Edits a call to action, or adds one by hand. "Directed at" suggests the event's organisations
 * and the usual groups, and takes any other name typed in.
 */
export function CallDialog({
  open,
  call,
  sessions,
  targets,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Null to add one. */
  call: CallToAction | null;
  sessions: { value: string; label: string }[];
  targets: string[];
  pending: boolean;
  error: string | null;
  onSave: (body: ReturnType<typeof toBody> & { sessionId: string | null }) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<CallToActionForm>(() => (call ? toForm(call) : EMPTY_FORM));
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof CallToActionForm>(key: K, value: CallToActionForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblem(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const issue = formProblem(form);
    if (issue) return setProblem(issue);
    onSave({ ...toBody(form), sessionId: form.sessionId || null });
  };

  return (
    <FormDialog
      open={open}
      icon={MegaphoneIcon}
      title={call ? 'Edit call to action' : 'Add a call to action'}
      subtitle={call ? 'Make it say exactly what was asked, and of whom.' : 'One the analysis missed, or from your own notes. It is approved as you save it.'}
      pending={pending}
      submitLabel={call ? 'Save' : 'Add'}
      error={problem ?? error}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field id={`${id}-action`} label="What should be done">
        <textarea id={`${id}-action`} rows={3} value={form.action} maxLength={2000} onChange={(e) => set('action', e.target.value)} className={textarea} placeholder="Make sex-disaggregated data mandatory in every federal survey" />
      </Field>
      <Field id={`${id}-short`} label="Slide line" optional hint="At most about 25 words. Left empty, the full text is used.">
        <TextInput id={`${id}-short`} value={form.shortText} maxLength={200} onChange={(e) => set('shortText', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-target`} label="Directed at">
          <TextInput id={`${id}-target`} list={`${id}-targets`} value={form.directedAt} maxLength={200} onChange={(e) => set('directedAt', e.target.value)} placeholder="Federal Ministry of Women Affairs" />
          <datalist id={`${id}-targets`}>
            {targets.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field id={`${id}-type`} label="Type">
          <Select id={`${id}-type`} value={form.type} options={(['recommendation', 'pledge'] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} onChange={(v) => set('type', v)} />
        </Field>
        <Field id={`${id}-by`} label="Proposed by" optional>
          <TextInput id={`${id}-by`} value={form.proposedBy} maxLength={200} onChange={(e) => set('proposedBy', e.target.value)} />
        </Field>
        <Field id={`${id}-org`} label="Their organisation" optional>
          <TextInput id={`${id}-org`} value={form.proposedByOrganisation} maxLength={200} onChange={(e) => set('proposedByOrganisation', e.target.value)} />
        </Field>
        <Field id={`${id}-when`} label="By when" optional>
          <TextInput id={`${id}-when`} value={form.deadline} maxLength={120} onChange={(e) => set('deadline', e.target.value)} placeholder="By 2027" />
        </Field>
        <Field id={`${id}-amount`} label="How much" optional>
          <TextInput id={`${id}-amount`} value={form.amount} maxLength={120} onChange={(e) => set('amount', e.target.value)} placeholder="₦2bn, 500 shelters" />
        </Field>
        <Field id={`${id}-theme`} label="Theme" optional>
          <TextInput id={`${id}-theme`} value={form.theme} maxLength={120} onChange={(e) => set('theme', e.target.value)} />
        </Field>
        <Field id={`${id}-session`} label="Session" optional>
          <Select id={`${id}-session`} value={form.sessionId} options={[{ value: '', label: 'No session' }, ...sessions]} onChange={(v) => set('sessionId', v)} />
        </Field>
      </div>
      <Field id={`${id}-quote`} label="What was said" optional hint="The words it rests on, as captioned.">
        <textarea id={`${id}-quote`} rows={2} value={form.quote} maxLength={2000} onChange={(e) => set('quote', e.target.value)} className={textarea} />
      </Field>
      <div className="flex items-center gap-3">
        <Switch checked={form.needsDetail} onChange={(v) => set('needsDetail', v)} labelledBy={`${id}-detail`} />
        <span id={`${id}-detail`} className="text-sm text-ink">
          Needs more detail before it goes on a slide
        </span>
      </div>
    </FormDialog>
  );
}
