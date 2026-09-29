'use client';

import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';

/**
 * A modal "are you sure?" built on the native <dialog>, which traps focus, handles Escape and
 * restores focus to the page when it closes. While `pending`, it cannot be dismissed and the
 * confirm button shows `pendingLabel`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending = false,
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click on the dialog element itself (not its panel) is a click on the backdrop.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !pending) onCancel();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault(); // Escape: let React state close it, and not mid-action
        if (!pending) onCancel();
      }}
      onClick={onBackdrop}
      className={modalClass('sm')}
    >
      <div className="flex flex-col gap-3 p-6">
        <ModalHeader
          icon={tone === 'danger' ? ExclamationTriangleIcon : CheckCircleIcon}
          iconClassName={tone === 'danger' ? 'text-danger' : undefined}
          title={title}
          titleId={titleId}
          subtitle={children}
          subtitleId={bodyId}
        />
        <ModalActions>
          {/* Cancel takes focus first, so a stray Enter never confirms. */}
          <button type="button" autoFocus onClick={onCancel} disabled={pending} className={cancelClass}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className={buttonClass({ color: tone === 'danger' ? 'danger' : 'primary' })}>
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </ModalActions>
      </div>
    </dialog>
  );
}
