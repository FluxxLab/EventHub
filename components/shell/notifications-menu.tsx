'use client';

import Link from 'next/link';
import { BellIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

import { SEVERITY } from '@/components/dashboard/activity-card';
import { Skeleton } from '@/components/ui/card';
import { dropdownPanel } from '@/components/ui/use-anchored';
import { useDashboard } from '@/lib/dashboard/use-dashboard';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

/** When this browser last opened the list; newer items count as unread. */
const SEEN_KEY = 'pic.admin.notifications-seen';

// A tiny store over localStorage, so the badge reads it without an effect and updates on open.
const listeners = new Set<() => void>();
const seenStore = {
  get(): number {
    try {
      return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
    } catch {
      return 0; // storage blocked: everything counts as unread, which is the safe side
    }
  },
  mark(at: number) {
    try {
      window.localStorage.setItem(SEEN_KEY, String(at));
    } catch {
      // not remembered this time
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * The navbar bell: a count of account and security events since the list was last opened, and a
 * dropdown of the newest ones. It reads the dashboard query (cached, refreshed every 30 s), so it
 * costs no extra request.
 */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [seenBefore, setSeenBefore] = useState(0);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dashboard = useDashboard();
  const seenAt = useSyncExternalStore(seenStore.subscribe, seenStore.get, () => 0);
  const items = dashboard.data?.activity ?? [];
  const unread = items.filter((item) => Date.parse(item.at) > seenAt).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    // Opening shows everything, so the badge clears; the rows that were new keep their dots until closed.
    if (!open) {
      setSeenBefore(seenAt);
      seenStore.mark(Date.now());
    }
    setOpen((was) => !was);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        title="Notifications"
        className={cn('relative flex size-9 items-center justify-center rounded text-ink hover:bg-surface-soft', open && 'bg-surface-soft')}
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-medium leading-none text-on-primary">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className={cn(dropdownPanel, 'absolute right-0 top-full z-50 mt-2 flex w-[min(24rem,calc(100vw-2rem))] flex-col')}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-ink">Notifications</p>
            <Link href="/security" onClick={() => setOpen(false)} className="text-xs text-[#7c7c7c] hover:text-primary">
              Security log
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto p-2 scrollbar-thin">
            {!dashboard.data ? (
              dashboard.isError ? (
                <p className="px-2 py-6 text-center text-sm text-muted">Notifications could not load.</p>
              ) : (
                <div className="flex flex-col gap-2 p-1" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              )
            ) : items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((item, i) => {
                  const severity = SEVERITY[item.severity];
                  // Compared with the time before this opening, so this visit's new rows stay marked.
                  const isNew = Date.parse(item.at) > seenBefore;
                  return (
                    <li key={`${item.at}-${i}`} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-soft">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${severity.tint}`}>
                        <severity.icon className="size-4" title={severity.label} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5 text-[#525252]">{item.description}</p>
                        <p className="mt-0.5 text-xs text-[#7c7c7c]">{ago(item.at)}</p>
                      </div>
                      {isNew && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="New" role="img" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/notifications?compose=1"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-sm text-primary hover:bg-surface-soft"
          >
            <MegaphoneIcon className="size-4" />
            Send an announcement
          </Link>
        </div>
      )}
    </div>
  );
}
