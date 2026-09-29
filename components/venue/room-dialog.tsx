'use client';

import { BuildingOffice2Icon, CheckCircleIcon, Square3Stack3DIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { roomFormOf, roomSchema, toRoomBody, type Room, type RoomForm } from '@/lib/venue/venue';
import { useRoomMutations } from '@/lib/venue/use-venue';

type Errors = Partial<Record<keyof RoomForm, string>>;

/**
 * Add, edit or describe a room. `room` null adds one; a room with no id (named only by the
 * programme) is "described", which creates it under the same name.
 */
export function RoomDialog({ open, onClose, editionId, room }: { open: boolean; onClose: () => void; editionId: string; room: Room | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [form, setForm] = useState<RoomForm>(() => roomFormOf(room));
  const [errors, setErrors] = useState<Errors>({});
  const { create, update } = useRoomMutations(editionId);
  const toast = useToast();
  const editing = !!room?.id;
  const mutation = editing ? update : create;
  const title = editing ? 'Edit room' : room ? `Describe ${room.name}` : 'Add room';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Each opening starts from the room it was opened for.
  const [openedFor, setOpenedFor] = useState<Room | null | undefined>(undefined);
  if (open && openedFor !== room) {
    setOpenedFor(room);
    setForm(roomFormOf(room));
    setErrors({});
  }

  const close = () => {
    if (mutation.isPending) return;
    create.reset();
    update.reset();
    setOpenedFor(undefined);
    onClose();
  };
  const set = (key: keyof RoomForm, value: string) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = roomSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof RoomForm] ??= issue.message;
      setErrors(next);
      return;
    }
    const body = toRoomBody(parsed.data);
    const done = () => {
      create.reset();
      update.reset();
      setOpenedFor(undefined);
      onClose();
      toast.push({ title: editing ? 'Room updated' : 'Room added', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${body.name} is saved for this event.` });
    };
    if (editing) update.mutate({ id: room!.id!, body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
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
          <ModalHeader icon={BuildingOffice2Icon} title={title} titleId={id('title')} subtitle="Sessions find their room by this name, so keep it as the programme writes it." />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          <Field id={id('name')} label="Name" error={errors.name}>
            <TextInput
              id={id('name')}
              icon={BuildingOffice2Icon}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Main Hall"
              invalid={!!errors.name}
              aria-describedby={describedBy(id('name'), errors.name)}
              autoFocus
            />
          </Field>
          <Field id={id('floor')} label="Floor" optional error={errors.floor}>
            <TextInput id={id('floor')} icon={Square3Stack3DIcon} value={form.floor} onChange={(e) => set('floor', e.target.value)} placeholder="Ground floor" invalid={!!errors.floor} />
          </Field>
          <Field id={id('notes')} label="Notes" optional error={errors.notes} hint="Shown to delegates on the venue page: capacity, access, what it is used for.">
            <textarea
              id={id('notes')}
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Plenaries; 600 seats, step-free entrance on the east side."
              aria-describedby={describedBy(id('notes'), errors.notes, 'hint')}
              className={cn(
                'w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm leading-5 text-[#525252] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-shadow placeholder:text-placeholder focus:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1]',
                errors.notes ? 'border-danger' : 'border-[#bdbdbd]',
              )}
            />
          </Field>
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
            {mutation.isPending ? 'Saving…' : editing ? 'Save room' : 'Add room'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
