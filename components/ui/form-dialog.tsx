'use client';

import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import type { HeroIcon } from '@/lib/nav';

/**
 * The shared form frame, in the design system's modal style (see ./modal): the header and the
 * buttons stay put, and only the fields between them scroll.
 */
export function FormDialog({
  open,
  icon = PencilSquareIcon,
  title,
  subtitle,
  pending,
  pendingLabel = 'Saving…',
  submitLabel,
  error,
  onSubmit,
  onClose,
  children,
  dirty = false,
}: {
  open: boolean;
  /** Shown beside the title; what the form is about. */
  icon?: HeroIcon;
  title: string;
  subtitle: string;
  pending: boolean;
  /** The submit button's words while pending. */
  pendingLabel?: string;
  submitLabel: string;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
  /** The form holds changes not yet saved: closing asks first, and leaving the page warns. */
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // nothing to discard any more (saved, undone): stop asking
  if (confirmDiscard && !dirty) setConfirmDiscard(false);
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);
  const close = () => {
    if (pending) return;
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    setConfirmDiscard(false);
    onClose();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('md')}
    >
      <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={icon} title={title} titleId={titleId} subtitle={subtitle} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          {children}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        {confirmDiscard && (
          <div role="alert" className="pop-in mx-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
            <span>Discard your changes?</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setConfirmDiscard(false)} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Keep editing
              </button>
              <button type="button" onClick={close} className={buttonClass({ color: 'danger' })}>
                Discard
              </button>
            </span>
          </div>
        )}
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass()}>
            {pending && <Spinner />}
            {pending ? pendingLabel : submitLabel}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
