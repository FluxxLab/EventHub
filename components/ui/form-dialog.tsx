'use client';

import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';

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
  submitLabel,
  error,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean;
  /** Shown beside the title; what the form is about. */
  icon?: HeroIcon;
  title: string;
  subtitle: string;
  pending: boolean;
  submitLabel: string;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const close = () => !pending && onClose();
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
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={close} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass()}>
            {pending ? 'Saving…' : submitLabel}
          </button>
        </ModalActions>
      </form>
    </dialog>
  );
}
