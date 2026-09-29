'use client';

import { ArrowUpTrayIcon, BriefcaseIcon, BuildingOffice2Icon, MicrophoneIcon, UserIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { buttonClass } from '@/components/ui/button';
import { describedBy, Field, TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { createSpeakerSchema, PHOTO_TYPES, photoProblem, toSpeakerBody, type CreateSpeakerForm, type Speaker } from '@/lib/speakers/speakers';
import { useCreateSpeaker, useUpdateSpeaker } from '@/lib/speakers/use-speakers';

const EMPTY: CreateSpeakerForm = { name: '', role: '', organisation: '' };
type Errors = Partial<Record<keyof CreateSpeakerForm | 'photo', string>>;

/**
 * "Add speaker": photo (optional, previewed before upload), name, role and organisation. The
 * photo is uploaded only when the form is saved, so cancelling leaves nothing behind.
 */
export function CreateSpeakerDialog({ open, onClose, speaker = null }: { open: boolean; onClose: () => void; /** Set to edit this speaker instead of adding one. */ speaker?: Speaker | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const [form, setForm] = useState<CreateSpeakerForm>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const create = useCreateSpeaker();
  const update = useUpdateSpeaker();
  const pending = create.isPending || update.isPending;
  const failed = speaker ? update.error : create.error;
  // Editing: the stored photo shows until it is replaced or removed.
  const [removedPhoto, setRemovedPhoto] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (open && speaker && editingId !== speaker.id) {
    setEditingId(speaker.id);
    setForm({ name: speaker.name, role: speaker.role ?? '', organisation: speaker.organisation ?? '' });
    setPhoto(null);
    setPreview(null);
    setRemovedPhoto(false);
    setErrors({});
  }
  const shownPhoto = preview ?? (speaker && !removedPhoto ? speaker.avatarUrl : null);
  const toast = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Free the preview's object URL when it is replaced or the dialog unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // picking the same file again should still fire
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) {
      setErrors((was) => ({ ...was, photo: problem }));
      return;
    }
    setErrors((was) => ({ ...was, photo: undefined }));
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };
  const clearPhoto = () => {
    setPhoto(null);
    setPreview(null);
    if (speaker) setRemovedPhoto(true);
  };

  const finish = () => {
    setForm(EMPTY);
    clearPhoto();
    setErrors({});
    create.reset();
    update.reset();
    setEditingId(null);
    setRemovedPhoto(false);
    onClose();
  };
  const close = () => {
    if (!pending) finish();
  };
  const set = (key: keyof CreateSpeakerForm, value: string) => {
    setForm((was) => ({ ...was, [key]: value }));
    if (errors[key]) setErrors((was) => ({ ...was, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const parsed = createSpeakerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof CreateSpeakerForm] ??= issue.message;
      setErrors(next);
      return;
    }
    if (speaker) {
      update.mutate(
        { speaker, body: toSpeakerBody(parsed.data, null), photo, removePhoto: removedPhoto && !photo },
        {
          onSuccess: (saved) => {
            finish();
            toast.push({ title: 'Speaker saved', leading: { kind: 'avatar', name: saved.name, src: saved.avatarUrl }, body: `${saved.name} is up to date in every programme they are in.` });
          },
        },
      );
      return;
    }
    create.mutate(
      { body: toSpeakerBody(parsed.data, null), photo },
      {
        onSuccess: (created) => {
          finish();
          toast.push({
            title: 'Speaker added',
            leading: { kind: 'avatar', name: created.name, src: created.avatarUrl },
            body: `${created.name} can now be added to sessions in the programme.`,
          });
        },
      },
    );
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
          <ModalHeader icon={MicrophoneIcon} title={speaker ? 'Edit speaker' : 'Add speaker'} titleId={id('title')} subtitle={speaker ? 'Speakers are shared across events: a change shows in every programme they are in.' : 'Speakers are shared across events; add them once, use them in any programme.'} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          {/* Photo: preview beside the upload and remove actions. */}
          <div className="flex items-center gap-4">
            <Avatar name={form.name || undefined} src={shownPhoto} size={80} />
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">
                Photo <span className="text-[#7c7c7c]">(optional)</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  <ArrowUpTrayIcon className="size-4" />
                  {shownPhoto ? 'Replace' : 'Upload photo'}
                </button>
                {shownPhoto && (
                  <button type="button" onClick={clearPhoto} className={buttonClass({ style: 'borderless', color: 'danger' })}>
                    Remove
                  </button>
                )}
              </div>
              <p className={errors.photo ? 'text-xs text-danger' : 'text-xs text-[#7c7c7c]'} role={errors.photo ? 'alert' : undefined}>
                {errors.photo ?? 'Square works best. JPG, PNG, WebP or HEIC, up to 5 MB.'}
              </p>
            </div>
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} onChange={pickPhoto} className="hidden" aria-hidden tabIndex={-1} />
          </div>

          <Field id={id('name')} label="Full name" error={errors.name}>
            <TextInput
              id={id('name')}
              icon={UserIcon}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Amina Yusuf"
              invalid={!!errors.name}
              aria-describedby={describedBy(id('name'), errors.name)}
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id('role')} label="Role" optional error={errors.role}>
              <TextInput id={id('role')} icon={BriefcaseIcon} value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Director" invalid={!!errors.role} />
            </Field>
            <Field id={id('organisation')} label="Organisation" optional error={errors.organisation}>
              <TextInput
                id={id('organisation')}
                icon={BuildingOffice2Icon}
                value={form.organisation}
                onChange={(e) => set('organisation', e.target.value)}
                placeholder="Policy Innovation Centre"
                invalid={!!errors.organisation}
              />
            </Field>
          </div>

          {failed && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {failed.message}
            </p>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass()}>
            {pending ? (photo ? 'Uploading…' : speaker ? 'Saving…' : 'Adding…') : speaker ? 'Save changes' : 'Add speaker'}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}

