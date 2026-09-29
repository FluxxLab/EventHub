'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, type FocusEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { type StaffUser, TIER_LABEL } from '@/lib/auth/session';
import { DEMO_MODE } from '@/lib/demo';
import type { NavGroup } from '@/lib/nav';
import { pageFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

const row = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-soft';
const activeRow = 'bg-primary-soft font-medium text-primary hover:bg-primary-soft';
/** Labels stay in the DOM (screen readers read them) and fade as the rail narrows. */
const label = (shown: boolean) => cn('truncate whitespace-nowrap transition-opacity duration-150', shown ? 'opacity-100' : 'opacity-0');
/** Grace period before a hover-opened sidebar closes, so a pointer grazing its edge does not flicker it. */
const CLOSE_DELAY_MS = 150;

/**
 * The left sidebar. Collapsed, it is a rail of group icons; pointing at it (or tabbing into it)
 * opens it, and the pin keeps it open. The shell owns both states so the navbar and page move
 * with it. A one-page group links straight to its page; a larger group opens in place, and the
 * group holding the current page starts open.
 */
export function Sidebar({
  user,
  groups,
  pinned,
  peek,
  onPeek,
  onTogglePin,
}: {
  user: StaffUser;
  groups: NavGroup[];
  pinned: boolean;
  /** Opened by hover or focus rather than the pin. */
  peek: boolean;
  onPeek: (open: boolean) => void;
  onTogglePin: () => void;
}) {
  const pathname = usePathname();
  const current = pageFor(pathname);
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current.group.label] : []));
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = pinned || peek;

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    onPeek(true);
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onPeek(false), CLOSE_DELAY_MS);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hide();
  };

  const toggle = (group: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <aside
      aria-label="Sections"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={onBlur}
      className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-surface"
    >
      <div className="flex h-22 shrink-0 items-center gap-3 border-b border-border px-4.5">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3" aria-label="PIC Events dashboard">
          <Image src="/pic-logo.png" alt="" width={36} height={36} className="size-9 shrink-0 object-contain" priority />
          <span className={cn(label(expanded), 'text-xl font-medium text-primary')}>PIC Events</span>
          {DEMO_MODE && expanded && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink">Demo</span>}
        </Link>
        {expanded && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? 'Collapse sidebar' : 'Keep sidebar open'}
            title={pinned ? 'Collapse sidebar' : 'Keep sidebar open'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-soft hover:text-ink"
          >
            {pinned ? <ChevronDoubleLeftIcon className="size-5" /> : <ChevronDoubleRightIcon className="size-5" />}
          </button>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3.5 py-6 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {groups.map((group) => {
          const holdsCurrent = current?.group.label === group.label;
          if (group.pages.length === 1) {
            const page = group.pages[0]!;
            return (
              <Link
                key={group.label}
                href={page.href}
                title={expanded ? undefined : page.label}
                aria-current={holdsCurrent ? 'page' : undefined}
                className={cn(row, holdsCurrent && activeRow)}
              >
                <page.icon className="size-5 shrink-0" />
                <span className={label(expanded)}>{page.label}</span>
              </Link>
            );
          }
          const groupOpen = open.has(group.label);
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={expanded && groupOpen}
                title={expanded ? undefined : group.label}
                className={cn(row, holdsCurrent && !(expanded && groupOpen) && activeRow)}
              >
                <group.icon className="size-5 shrink-0" />
                <span className={cn(label(expanded), 'flex-1')}>{group.label}</span>
                <ChevronDownIcon
                  className={cn('size-4 shrink-0 text-muted transition-transform', groupOpen && 'rotate-180', !expanded && 'opacity-0')}
                />
              </button>
              {expanded && groupOpen && (
                <ul className="flex flex-col gap-0.5 py-1">
                  {group.pages.map((page) => {
                    const active = current?.page.href === page.href;
                    return (
                      <li key={page.href}>
                        <Link
                          href={page.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-2.5 whitespace-nowrap rounded-lg py-2 pl-8 pr-3 text-sm text-muted hover:bg-surface-soft hover:text-ink',
                            active && activeRow,
                          )}
                        >
                          <page.icon className="size-4.5 shrink-0" />
                          <span className="truncate">{page.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Same height as the page footer, so their top borders line up across the window. */}
      <div className="flex h-17 shrink-0 items-center gap-3 border-t border-border px-4.5">
        <Avatar name={user.name} src={user.avatarUrl} size={40} online />
        <div className={cn(label(expanded), 'min-w-0 leading-tight')}>
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">{TIER_LABEL[user.tier]}</p>
        </div>
      </div>
    </aside>
  );
}
