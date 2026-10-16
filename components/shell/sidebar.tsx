'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronDownIcon, StarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { useOpenGroups, usePinnedPages, useSidebarCounts } from '@/components/shell/use-sidebar';
import { type StaffUser, TIER_LABEL } from '@/lib/auth/session';
import { DEMO_MODE } from '@/lib/demo';
import type { NavGroup } from '@/lib/nav';
import { pageFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

const row = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-soft';
const activeRow = 'bg-primary-soft font-medium text-primary hover:bg-primary-soft';
/** Labels stay in the DOM (screen readers read them) and fade as the rail narrows. */
/** A count of things waiting, beside a page. */
function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[0.6875rem] font-medium tabular-nums text-on-primary"
      aria-label={`${n} waiting`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

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
  // the groups left open are remembered; the one holding the current page is always open
  const [stored, setStored] = useOpenGroups();
  // the group holding the current page opens by itself, unless it was closed on purpose since
  const [closedByHand, setClosedByHand] = useState<Set<string>>(() => new Set());
  const here = current?.group.label;
  const open = new Set([...stored, ...(here && !closedByHand.has(here) ? [here] : [])]);
  const { pinned: pinnedHrefs, toggle: togglePinned } = usePinnedPages();
  const counts = useSidebarCounts(user.tier);
  const allPages = groups.flatMap((g) => g.pages);
  const pinnedPages = pinnedHrefs.map((href) => allPages.find((p) => p.href === href)).filter((p): p is (typeof allPages)[number] => !!p);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = pinned || peek;

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    onPeek(true);
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onPeek(false), CLOSE_DELAY_MS);
  };
  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    onPeek(false);
  };
  // Keyboard focus only: a clicked link keeps focus, and the browser focuses it again when the
  // window comes back (after another app or DevTools), which opened the rail with no pointer near.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) show();
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hide();
  };
  // A page picked from a hover-opened rail closes it; on a touch screen nothing else would.
  const onPick = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) closeNow();
  };

  const toggle = (group: string) => {
    const closing = open.has(group);
    setStored(closing ? stored.filter((g) => g !== group) : [...stored.filter((g) => g !== group), group]);
    setClosedByHand((was) => {
      const next = new Set(was);
      if (closing) next.add(group);
      else next.delete(group);
      return next;
    });
  };

  return (
    <aside
      aria-label="Sections"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={onFocus}
      onBlur={onBlur}
      className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-surface"
    >
      <div className="flex h-22 shrink-0 items-center gap-3 border-b border-border px-4.5">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3" aria-label="PIC Events dashboard">
          <Image src="/pic-logo.png" alt="" width={36} height={36} className="logo-plate size-9 shrink-0 object-contain" priority />
          <span className={cn(label(expanded), 'text-xl font-medium text-primary')}>PIC Events</span>
          {DEMO_MODE && expanded && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.625rem] font-medium uppercase text-ink">Demo</span>}
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

      <nav onClick={onPick} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3.5 py-6 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {pinnedPages.length > 0 && (
          <div className="mb-2 flex flex-col gap-0.5 border-b border-border pb-3">
            <p className={cn(label(expanded), 'px-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-hint')}>Pinned</p>
            {pinnedPages.map((page) => {
              const active = current?.page.href === page.href;
              return (
                <Link key={page.href} href={page.href} aria-current={active ? 'page' : undefined} className={cn(row, active && activeRow)}>
                  <page.icon className="size-5 shrink-0" />
                  <span className={cn(label(expanded), 'flex-1')}>{page.label}</span>
                  {expanded && <Count n={counts[page.href] ?? 0} />}
                </Link>
              );
            })}
          </div>
        )}
        {groups.map((group) => {
          const waiting = group.pages.reduce((sum, p) => sum + (counts[p.href] ?? 0), 0);
          const holdsCurrent = current?.group.label === group.label;
          if (group.pages.length === 1) {
            const page = group.pages[0]!;
            return (
              <Link key={group.label} href={page.href} aria-current={holdsCurrent ? 'page' : undefined} className={cn(row, holdsCurrent && activeRow)}>
                <page.icon className="size-5 shrink-0" />
                <span className={cn(label(expanded), 'flex-1')}>{page.label}</span>
                {expanded && <Count n={counts[page.href] ?? 0} />}
              </Link>
            );
          }
          const groupOpen = open.has(group.label);
          return (
            <div key={group.label}>
              <button type="button" onClick={() => toggle(group.label)} aria-expanded={expanded && groupOpen} className={cn(row, holdsCurrent && !(expanded && groupOpen) && activeRow)}>
                <span className="relative shrink-0">
                  <group.icon className="size-5" />
                  {waiting > 0 && !(expanded && groupOpen) && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-surface bg-danger" aria-hidden />}
                </span>
                <span className={cn(label(expanded), 'flex-1')}>{group.label}</span>
                <ChevronDownIcon className={cn('size-4 shrink-0 text-muted transition-transform', groupOpen && 'rotate-180', !expanded && 'opacity-0')} />
              </button>
              {expanded && (
                // eases open and shut; a closed group's links are out of the Tab order
                <div className="collapse" data-open={groupOpen}>
                  <ul className="flex flex-col gap-0.5 py-1" inert={!groupOpen}>
                    {group.pages.map((page) => {
                      const active = current?.page.href === page.href;
                      const isPinned = pinnedHrefs.includes(page.href);
                      return (
                        <li key={page.href} className="group/item relative">
                          <Link
                            href={page.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn('flex items-center gap-2.5 whitespace-nowrap rounded-lg py-2 pl-8 pr-3 text-sm text-muted hover:bg-surface-soft hover:text-ink', active && activeRow)}
                          >
                            <page.icon className="size-4.5 shrink-0" />
                            <span className="truncate">{page.label}</span>
                            <Count n={counts[page.href] ?? 0} />
                            <span className="w-6 shrink-0" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => togglePinned(page.href)}
                            aria-label={isPinned ? `Unpin ${page.label}` : `Pin ${page.label} to the top`}
                            aria-pressed={isPinned}
                            className={cn(
                              'absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-hint hover:text-ink',
                              isPinned ? 'text-secondary' : 'opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100',
                            )}
                          >
                            {isPinned ? <StarSolid className="size-4" /> : <StarIcon className="size-4" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
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
