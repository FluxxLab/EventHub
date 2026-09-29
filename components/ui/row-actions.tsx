'use client';

import { EllipsisVerticalIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { anchoredPanel, dropdownItem, dropdownPanel, useAnchored } from '@/components/ui/use-anchored';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

export type RowAction = { label: string; icon: HeroIcon; onSelect: () => void; disabled?: boolean };

/**
 * A table row's actions in a kebab (⋮) menu: any row-specific actions first, then Edit, then
 * Delete in red. Keyboard: the arrow keys move between items, Escape closes and returns focus.
 */
export function RowActions({ name, onEdit, onDelete, actions = [] }: { name: string; onEdit?: () => void; onDelete?: () => void; actions?: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);
  useAnchored(open, button, panel, close);

  // the first item takes focus when the menu opens
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  const items: (RowAction & { danger?: boolean })[] = [
    ...actions,
    ...(onEdit ? [{ label: 'Edit', icon: PencilSquareIcon, onSelect: onEdit }] : []),
    ...(onDelete ? [{ label: 'Delete', icon: TrashIcon, onSelect: onDelete, danger: true }] : []),
  ];
  if (items.length === 0) return null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div className="flex justify-end">
      <button
        ref={button}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex size-8 items-center justify-center rounded-lg text-[#525252] hover:bg-surface-soft', open && 'bg-surface-soft')}
      >
        <EllipsisVerticalIcon className="size-5" />
      </button>
      {open && (
        <div ref={panel} id={menuId} role="menu" aria-label={`Actions for ${name}`} onKeyDown={onKey} className={cn(anchoredPanel, dropdownPanel, 'flex w-44 flex-col p-1')}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                dropdownItem,
                'disabled:opacity-50',
                item.danger ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'hover:bg-surface-soft focus:bg-surface-soft',
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Delete …?" with the API's reason when it refuses: things that other records depend on are not
 * deleted, and the message says what is in the way (tickets sold, sessions a speaker is on).
 */
export function DeleteDialog({
  open,
  title,
  children,
  pending,
  refusal,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  pending: boolean;
  /** The API's reason for refusing, shown in place of the Delete button's effect. */
  refusal: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog open={open} title={title} tone="danger" confirmLabel="Delete" pendingLabel="Deleting…" pending={pending} onConfirm={onConfirm} onCancel={onCancel}>
      {children}
      {refusal && (
        <span role="alert" className="mt-3 block rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {refusal}
        </span>
      )}
    </ConfirmDialog>
  );
}
