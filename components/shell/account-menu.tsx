'use client';

import Link from 'next/link';
import { ArrowRightStartOnRectangleIcon, ChevronDownIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { session, type StaffUser, TIER_LABEL } from '@/lib/auth/session';
import { PROFILE_HREF } from '@/lib/nav';
import { dropdownItem, dropdownPanel } from '@/components/ui/use-anchored';
import { cn } from '@/lib/utils';

const item = cn(dropdownItem, 'outline-none');

/**
 * The navbar's account button: the user's avatar, opening a menu with who is signed in, their
 * profile and log out (which asks for confirmation first). Closes on Escape, outside click or
 * choosing an item; the arrow keys move between items.
 */
export function AccountMenu({ user }: { user: StaffUser }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const role = TIER_LABEL[user.tier];

  useEffect(() => {
    if (!open) return;
    // Focus the first item so the keyboard lands inside the menu it just opened.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await session.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${user.name}`}
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-surface-soft"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={40} focused={open} />
        <ChevronDownIcon className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className={cn(dropdownPanel, 'absolute right-0 top-full z-50 mt-2 flex w-72 flex-col gap-2 px-2 pb-3 pt-4')}
        >
          <div className="flex items-center gap-3 px-2.5 pb-1">
            <Avatar name={user.name} src={user.avatarUrl} size={40} online />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-1 text-xs text-muted">{role}</p>
            </div>
          </div>
          <div className="h-px bg-border" role="separator" />
          <Link href={PROFILE_HREF} role="menuitem" onClick={() => close(false)} className={cn(item, 'hover:bg-surface-soft focus:bg-surface-soft')}>
            <UserCircleIcon className="size-5" />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false);
              setConfirming(true);
            }}
            className={cn(item, 'text-danger hover:bg-danger-soft focus:bg-danger-soft')}
          >
            <ArrowRightStartOnRectangleIcon className="size-5" />
            Log out
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Log out?"
        confirmLabel="Log out"
        pendingLabel="Logging out…"
        pending={signingOut}
        tone="danger"
        onConfirm={() => void signOut()}
        onCancel={() => {
          setConfirming(false);
          buttonRef.current?.focus();
        }}
      >
        You&apos;ll need to sign in again to use the console.
      </ConfirmDialog>
    </div>
  );
}
