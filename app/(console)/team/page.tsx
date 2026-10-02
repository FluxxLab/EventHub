'use client';

import { ArrowPathIcon, CheckCircleIcon, CheckIcon, ClipboardDocumentIcon, EnvelopeIcon, KeyIcon, PlusIcon, UserGroupIcon, UserIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { useSession } from '@/lib/auth/session';
import { dateRange } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import { removalBlocker, ROLE_HINT, ROLE_LABEL, STAFF_ROLES, staffSchema, temporaryPassword, type StaffForm, type StaffMember, type StaffRole } from '@/lib/team/team';
import { useStaff, useStaffActions } from '@/lib/team/use-team';
import { cn } from '@/lib/utils';

const cardClass =
  'overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_16px_-4px_rgba(36,36,36,0.08),0_4px_6px_-2px_rgba(36,36,36,0.03)]';
const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

/** Role as choice cards, each saying what the role can do. */
function RolePicker({ value, onChange }: { value: StaffRole; onChange: (role: StaffRole) => void }) {
  return (
    <div role="radiogroup" aria-label="Role" className="grid gap-2">
      {STAFF_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          onClick={() => onChange(role)}
          className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors', value === role ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-soft')}
        >
          <span className={cn('block text-sm', value === role ? 'font-medium text-primary' : 'text-ink')}>{ROLE_LABEL[role]}</span>
          <span className="block text-xs leading-5 text-[#7c7c7c]">{ROLE_HINT[role]}</span>
        </button>
      ))}
    </div>
  );
}

/** The events an event organiser runs: tick one or more. */
function EventsPicker({ value, onChange, error }: { value: string[]; onChange: (ids: string[]) => void; error?: string }) {
  const editions = useEditions();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-ink">Events they run</p>
      {editions.isPending ? (
        <Skeleton className="h-24" />
      ) : editions.isError ? (
        <p className="text-sm text-danger">{editions.error.message}</p>
      ) : (
        <ul role="group" aria-label="Events they run" className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-border p-1.5">
          {(editions.data ?? []).map((e) => {
            const on = value.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onChange(on ? value.filter((v) => v !== e.id) : [...value, e.id])}
                  className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-soft', on && 'bg-primary-soft/50')}
                >
                  <span className={cn('flex size-4.5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-on-primary' : 'border-[#bdbdbd]')} aria-hidden>
                    {on && <CheckIcon className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{e.name}</span>
                    <span className="block text-xs text-[#7c7c7c]">
                      {e.shortName} · {dateRange(e.startsAt, e.endsAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Add a staff account with a temporary password to hand over; they change it after signing in. */
function AddStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const blank = (): StaffForm => ({ name: '', email: '', password: temporaryPassword(), role: 'session_admin', editionIds: [] });
  const [form, setForm] = useState<StaffForm>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffForm, string>>>({});
  const [copied, setCopied] = useState(false);
  const { add } = useStaffActions();
  const toast = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const finish = () => {
    setForm(blank());
    setErrors({});
    setCopied(false);
    add.reset();
    onClose();
  };
  const close = () => {
    if (!add.isPending) finish();
  };
  const set = <K extends keyof StaffForm>(key: K, value: StaffForm[K]) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the password is still visible to copy by hand
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (add.isPending) return;
    const parsed = staffSchema.safeParse(form);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof StaffForm] ??= issue.message;
      setErrors(next);
      return;
    }
    add.mutate(parsed.data, {
      onSuccess: () => {
        toast.push({
          title: 'Staff account created',
          leading: { kind: 'avatar', name: parsed.data.name },
          body: `${parsed.data.name} can sign in as ${ROLE_LABEL[parsed.data.role].toLowerCase()} with the temporary password you copied.`,
          duration: 0,
        });
        finish();
      },
    });
  };
  const id = (name: string) => `${baseId}-${name}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('title')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('md')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={UserPlusIcon} title="Add staff" titleId={id('title')} subtitle="A console account for someone on the organising team." />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          <Field id={id('name')} label="Full name" error={errors.name}>
            <TextInput
              id={id('name')}
              icon={UserIcon}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Halima Bello"
              invalid={!!errors.name}
              aria-describedby={describedBy(id('name'), errors.name)}
              autoFocus
            />
          </Field>
          <Field id={id('email')} label="Work email" error={errors.email}>
            <TextInput
              id={id('email')}
              icon={EnvelopeIcon}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="halima@pic.org.ng"
              invalid={!!errors.email}
              aria-describedby={describedBy(id('email'), errors.email)}
            />
          </Field>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink">Role</p>
            <RolePicker value={form.role} onChange={(role) => set('role', role)} />
          </div>
          {form.role === 'event_admin' && <EventsPicker value={form.editionIds ?? []} onChange={(ids) => set('editionIds', ids)} error={errors.editionIds} />}
          <Field id={id('password')} label="Temporary password" error={errors.password} hint="Send it to them privately. They should change it after first signing in.">
            <div className="flex gap-2">
              <TextInput id={id('password')} icon={KeyIcon} value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} className="flex-1 font-mono" />
              <button type="button" onClick={() => void copy()} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-10' })}>
                {copied ? <CheckCircleIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => {
                  set('password', temporaryPassword());
                  setCopied(false);
                }}
                aria-label="Generate another password"
                title="Generate another"
                className={buttonClass({ style: 'outline', color: 'gray', iconOnly: true, className: 'size-10' })}
              >
                <ArrowPathIcon className="size-4" />
              </button>
            </div>
          </Field>
          {add.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {add.error.message}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={add.isPending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={add.isPending} className={buttonClass()}>
            {add.isPending ? 'Creating…' : 'Create account'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}

export default function TeamPage() {
  const staff = useStaff();
  const { setRole, remove } = useStaffActions();
  const state = useSession();
  const selfId = state.status === 'signed-in' ? state.user.id : undefined;
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<StaffMember | null>(null);
  const [newRole, setNewRole] = useState<StaffRole>('admin');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [eventsError, setEventsError] = useState<string | undefined>();
  const editions = useEditions();
  const eventName = (id: string) => editions.data?.find((e) => e.id === id)?.shortName ?? 'Unknown event';
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const members = staff.data ?? [];
  const organisers = members.filter((m) => m.accessTier === 'admin').length;

  const confirmRole = (event: FormEvent) => {
    event.preventDefault();
    if (!changing) return;
    if (newRole === 'event_admin' && newEvents.length === 0) return setEventsError('Choose at least one event they run.');
    setRole.mutate(
      { id: changing.id, role: newRole, editionIds: newEvents },
      {
        onSuccess: () => {
          toast.push({ title: 'Role changed', leading: { kind: 'avatar', name: changing.name }, body: `${changing.name} is now ${ROLE_LABEL[newRole].toLowerCase()}${newRole === 'event_admin' ? ` for ${newEvents.map(eventName).join(', ')}` : ''}.` });
          setChanging(null);
        },
      },
    );
  };
  const confirmRemove = () =>
    removing &&
    remove.mutate(removing.id, {
      onSuccess: () => {
        toast.push({ title: 'Access removed', leading: { kind: 'avatar', name: removing.name }, body: `${removing.name} is an ordinary delegate again and can no longer open the console.` });
        setRemoving(null);
      },
    });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <h1 className="sr-only">Team</h1>
      <section aria-labelledby="team-title" className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 id="team-title" className="flex items-center gap-2 text-xl font-medium text-ink">
              Staff
              {staff.data && <Tag>{members.length}</Tag>}
            </h2>
            <p className="mt-0.5 text-sm text-[#7c7c7c]">People who can open this console. Delegates are listed separately.</p>
          </div>
          <button type="button" onClick={() => setAdding(true)} className={buttonClass()}>
            <PlusIcon className="size-4" />
            Add staff
          </button>
        </header>

        {staff.isError && !staff.data ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">Staff could not load.</p>
            <p className="mt-1 text-sm text-muted">{staff.error.message}</p>
            <button type="button" onClick={() => void staff.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Member
                  </th>
                  <th scope="col" className={th}>
                    Role
                  </th>
                  <th scope="col" className={th}>
                    Added
                  </th>
                  <th scope="col" className={cn(th, 'w-64')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody aria-busy={staff.isPending}>
                {staff.isPending
                  ? [0, 1, 2].map((i) => (
                      <tr key={i} className="even:bg-[#f6f6f6]">
                        <td colSpan={4} className={td}>
                          <Skeleton className="h-8" />
                        </td>
                      </tr>
                    ))
                  : members.map((m) => {
                      const blocker = removalBlocker(m, members, selfId);
                      return (
                        <tr key={m.id} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <Avatar name={m.name} size={32} />
                              <div className="min-w-0 leading-tight">
                                <p className="truncate text-[#525252]">
                                  {m.name}
                                  {m.id === selfId && <span className="ml-1.5 text-xs text-[#7c7c7c]">(you)</span>}
                                </p>
                                <p className="truncate text-xs text-placeholder">{m.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className={td}>
                            <Tag tone={m.accessTier === 'admin' ? 'primary' : m.accessTier === 'event_admin' ? 'gold' : 'gray'}>{ROLE_LABEL[m.accessTier]}</Tag>
                            {m.accessTier === 'event_admin' && (
                              <p className="mt-1 max-w-56 truncate text-xs text-[#7c7c7c]" title={(m.managedEditionIds ?? []).map(eventName).join(', ')}>
                                {(m.managedEditionIds ?? []).map(eventName).join(', ') || 'No events yet'}
                              </p>
                            )}
                          </td>
                          <td className={cn(td, 'whitespace-nowrap text-[#525252]')}>
                            {new Date(m.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className={cn(td, 'text-right')}>
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setChanging(m);
                                  setNewRole(m.accessTier);
                                  setNewEvents(m.managedEditionIds ?? []);
                                  setEventsError(undefined);
                                  setRole.reset();
                                }}
                                disabled={m.accessTier === 'admin' && organisers <= 1}
                                title={m.accessTier === 'admin' && organisers <= 1 ? 'The last organiser keeps the organiser role.' : undefined}
                                className={buttonClass({ style: 'outline', color: 'gray' })}
                              >
                                {m.accessTier === 'event_admin' ? 'Role & events' : 'Change role'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoving(m)}
                                disabled={!!blocker}
                                title={blocker ?? undefined}
                                className={buttonClass({ style: 'borderless', color: 'danger' })}
                              >
                                Remove access
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddStaffDialog open={adding} onClose={() => setAdding(false)} />
      <FormDialog
        open={!!changing}
        icon={UserGroupIcon}
        title={`Role for ${changing?.name ?? 'them'}`}
        subtitle="What they can open in the console. The change takes effect on their next page load."
        pending={setRole.isPending}
        submitLabel="Save"
        error={setRole.error?.message ?? null}
        onSubmit={confirmRole}
        onClose={() => setChanging(null)}
      >
        <RolePicker
          value={newRole}
          onChange={(role) => {
            setNewRole(role);
            setEventsError(undefined);
          }}
        />
        {newRole === 'event_admin' && (
          <EventsPicker
            value={newEvents}
            onChange={(ids) => {
              setNewEvents(ids);
              setEventsError(undefined);
            }}
            error={eventsError}
          />
        )}
      </FormDialog>
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? 'their'} access?`}
        confirmLabel="Remove access"
        pendingLabel="Removing…"
        pending={remove.isPending}
        tone="danger"
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      >
        They can no longer open the console. Their account stays as an ordinary delegate, and this change is logged.
        {remove.error && <span className="mt-2 block text-xs text-danger">{remove.error.message}</span>}
      </ConfirmDialog>
    </div>
  );
}
