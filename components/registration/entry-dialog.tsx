'use client';

import { BriefcaseIcon, BuildingOffice2Icon, CheckCircleIcon, EnvelopeIcon, HashtagIcon, IdentificationIcon, UserIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { TIER_LABEL, TIERS } from '@/lib/delegates/delegates';
import { entryFormOf, entrySchema, MAX_CODE, toEntryBody, type EntryForm, type RegistrationEntry } from '@/lib/registration/registration';
import { useRegistrationActions } from '@/lib/registration/use-registration';

const TIER_OPTIONS = TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }));
type Errors = Partial<Record<keyof EntryForm, string>>;

/** Add or edit one invitee: who they are, how they are matched, and the tier they receive. */
export function EntryDialog({ open, onClose, entry }: { open: boolean; onClose: () => void; entry: RegistrationEntry | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [form, setForm] = useState<EntryForm>(() => entryFormOf(entry));
  const [errors, setErrors] = useState<Errors>({});
  const { create, update } = useRegistrationActions();
  const toast = useToast();
  const editing = !!entry;
  const mutation = editing ? update : create;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const [openedFor, setOpenedFor] = useState<RegistrationEntry | null | undefined>(undefined);
  if (open && openedFor !== entry) {
    setOpenedFor(entry);
    setForm(entryFormOf(entry));
    setErrors({});
  }

  const reset = () => {
    create.reset();
    update.reset();
    setOpenedFor(undefined);
    onClose();
  };
  const close = () => {
    if (!mutation.isPending) reset();
  };
  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = entrySchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof EntryForm] ??= issue.message;
      setErrors(next);
      return;
    }
    const body = toEntryBody(parsed.data, { update: editing });
    const done = (saved: RegistrationEntry) => {
      reset();
      toast.push({
        title: editing ? 'Invite updated' : 'Invite added',
        leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' },
        body: `${saved.name ?? saved.email ?? 'The invitee'} will get ${TIER_LABEL[saved.assignedTier]} when they sign up${saved.inviteCode ? ` (code ${saved.inviteCode})` : ''}.`,
      });
    };
    if (editing) update.mutate({ id: entry!.id, body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  const id = (name: string) => `${baseId}-${name}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('heading')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('md')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={IdentificationIcon}
            title={editing ? 'Edit invite' : 'Add invite'}
            titleId={id('heading')}
            subtitle="Signing up with this email or invite code grants the tier below, with no review."
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id('name')} label="Name" error={errors.name} className="sm:col-span-2">
              <TextInput id={id('name')} icon={UserIcon} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Sarah Kimani" invalid={!!errors.name} aria-describedby={describedBy(id('name'), errors.name)} autoFocus />
            </Field>
            <Field id={id('email')} label="Email" optional error={errors.email} className="sm:col-span-2" hint="They are matched by this email when they sign up.">
              <TextInput
                id={id('email')}
                icon={EnvelopeIcon}
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="sarah@unwomen.org"
                invalid={!!errors.email}
                aria-describedby={describedBy(id('email'), errors.email, 'hint')}
              />
            </Field>
            <Field id={id('organisation')} label="Organisation" optional error={errors.organisation}>
              <TextInput id={id('organisation')} icon={BuildingOffice2Icon} value={form.organisation} onChange={(e) => set('organisation', e.target.value)} placeholder="UN Women" invalid={!!errors.organisation} />
            </Field>
            <Field id={id('title')} label="Job title" optional error={errors.title}>
              <TextInput id={id('title')} icon={BriefcaseIcon} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Programme Officer" invalid={!!errors.title} />
            </Field>
            <Field id={id('tier')} label="Tier they receive">
              <Select id={id('tier')} value={form.assignedTier} options={TIER_OPTIONS} onChange={(v) => set('assignedTier', v)} />
            </Field>
            <Field id={id('code')} label="Invite code" optional error={errors.inviteCode} hint={editing ? undefined : 'Leave blank and one is generated.'}>
              <TextInput
                id={id('code')}
                icon={HashtagIcon}
                value={form.inviteCode}
                onChange={(e) => set('inviteCode', e.target.value.toUpperCase())}
                placeholder="Auto"
                maxLength={MAX_CODE}
                invalid={!!errors.inviteCode}
                className="font-mono"
                help="For invitees without an email on file, such as a printed invitation."
              />
            </Field>
          </div>
          {mutation.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {mutation.error.message}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={mutation.isPending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className={buttonClass()}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save invite' : 'Add invite'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
