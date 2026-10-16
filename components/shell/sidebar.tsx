'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronDownIcon, ChevronRightIcon, StarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type ReactNode, type SVGProps } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { useOpenGroups, usePinnedPages, useSidebarCounts } from '@/components/shell/use-sidebar';
import { dropdownPanel } from '@/components/ui/use-anchored';
import { type StaffUser, TIER_LABEL } from '@/lib/auth/session';
import { DEMO_MODE } from '@/lib/demo';
import type { NavGroup } from '@/lib/nav';
import { pageFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

// on the navy sidebar: soft white text, a lighter wash on hover, the current page brighter with a gold icon
const row = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-rail-muted hover:bg-rail-hover hover:text-rail-ink';
const activeRow = 'bg-rail-active font-medium text-rail-ink hover:bg-rail-active [&_svg]:text-secondary';
// in a fly-out (a white panel)
const flyActive = 'bg-primary-soft font-medium text-primary hover:bg-primary-soft';
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

/** Labels stay in the DOM (screen readers read them) and fade as the rail narrows. */
const label = (shown: boolean) => cn('truncate whitespace-nowrap transition-opacity duration-150', shown ? 'opacity-100' : 'opacity-0');
/** Grace period before a fly-out closes, so the pointer can cross the gap to it without it vanishing. */
const CLOSE_DELAY_MS = 150;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Page = NavGroup['pages'][number];

/**
 * The left sidebar. Collapsed, it is a rail of icons: pointing at one (or tabbing to it) shows its
 * pages in a fly-out beside the rail, and a one-page item shows its name. Expanded (the arrows at
 * the foot of the rail, remembered), groups open in place, the one holding the current page
 * starting open, and pages can be pinned to the top. The shell owns the expanded state so the navbar
 * and page move with it.
 */
export function Sidebar({ user, groups, pinned, onTogglePin }: { user: StaffUser; groups: NavGroup[]; pinned: boolean; onTogglePin: () => void }) {
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
  const pinnedPages = pinnedHrefs.map((href) => allPages.find((p) => p.href === href)).filter((p): p is Page => !!p);
  const expanded = pinned;

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
    <aside aria-label="Sections" className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-surface">
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
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-soft hover:text-ink"
          >
            <ChevronDoubleLeftIcon className="size-5" />
          </button>
        )}
      </div>

      {/* the navigation: PIC navy, the logo's arcs at its foot, between the white logo and user rows */}
      <div data-rail className="flex min-h-0 flex-1 flex-col bg-rail bg-[url(/brand/rail-arcs.svg)] bg-[length:18.75rem_auto] bg-left-bottom bg-no-repeat text-rail-ink">
        {expanded ? (
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3.5 py-6 scrollbar-none">
            {pinnedPages.length > 0 && (
              <div className="mb-2 flex flex-col gap-0.5 border-b border-rail-border pb-3">
                <p className="px-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-rail-muted">Pinned</p>
                {pinnedPages.map((page) => {
                  const active = current?.page.href === page.href;
                  return (
                    <Link key={page.href} href={page.href} aria-current={active ? 'page' : undefined} className={cn(row, active && activeRow)}>
                      <page.icon className="size-5 shrink-0" />
                      <span className="flex-1 truncate">{page.label}</span>
                      <Count n={counts[page.href] ?? 0} />
                    </Link>
                  );
                })}
              </div>
            )}
            {groups.map((group) => {
              const holdsCurrent = current?.group.label === group.label;
              if (group.pages.length === 1) {
                const page = group.pages[0]!;
                return (
                  <Link key={group.label} href={page.href} aria-current={holdsCurrent ? 'page' : undefined} className={cn(row, holdsCurrent && activeRow)}>
                    <page.icon className="size-5 shrink-0" />
                    <span className="flex-1 truncate">{page.label}</span>
                    <Count n={counts[page.href] ?? 0} />
                  </Link>
                );
              }
              const waiting = group.pages.reduce((sum, p) => sum + (counts[p.href] ?? 0), 0);
              const groupOpen = open.has(group.label);
              return (
                <div key={group.label}>
                  <button type="button" onClick={() => toggle(group.label)} aria-expanded={groupOpen} className={cn(row, holdsCurrent && !groupOpen && activeRow)}>
                    <span className="relative shrink-0">
                      <group.icon className="size-5" />
                      {waiting > 0 && !groupOpen && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-rail bg-danger" aria-hidden />}
                    </span>
                    <span className="flex-1 truncate">{group.label}</span>
                    <ChevronDownIcon className={cn('size-4 shrink-0 text-rail-muted transition-transform', groupOpen && 'rotate-180')} />
                  </button>
                  {/* eases open and shut; a closed group's links are out of the Tab order */}
                  <div className="group-collapse" data-open={groupOpen}>
                    <ul className="flex flex-col gap-0.5 py-1" inert={!groupOpen}>
                      {group.pages.map((page) => {
                        const active = current?.page.href === page.href;
                        const isPinned = pinnedHrefs.includes(page.href);
                        return (
                          <li key={page.href} className="group/item relative">
                            <Link
                              href={page.href}
                              aria-current={active ? 'page' : undefined}
                              className={cn(
                                'flex items-center gap-2.5 whitespace-nowrap rounded-lg py-2 pl-8 pr-3 text-sm text-rail-muted hover:bg-rail-hover hover:text-rail-ink',
                                active && activeRow,
                              )}
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
                                'absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-rail-muted hover:text-rail-ink',
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
                </div>
              );
            })}
          </nav>
        ) : (
          <Rail groups={groups} pinnedPages={pinnedPages} counts={counts} currentHref={current?.page.href} currentGroup={here} onExpand={onTogglePin} />
        )}
      </div>

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

/**
 * The collapsed sidebar: one icon per page or group. Each shows a fly-out beside the rail while
 * pointed at or focused (a group's pages, or a page's name), one at a time; a group's icon also
 * opens it on a tap, for touch screens. Escape closes it and returns to the icon.
 */
function Rail({
  groups,
  pinnedPages,
  counts,
  currentHref,
  currentGroup,
  onExpand,
}: {
  groups: NavGroup[];
  pinnedPages: Page[];
  counts: Record<string, number>;
  currentHref?: string;
  currentGroup?: string;
  onExpand: () => void;
}) {
  const [fly, setFly] = useState<{ key: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const show = (key: string, el: HTMLElement) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = el.getBoundingClientRect();
    const rail = el.closest('aside')?.getBoundingClientRect();
    setFly({ key, top: r.top, left: (rail?.right ?? r.right) + 8 });
  };
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFly(null), CLOSE_DELAY_MS);
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setFly(null);
  };

  const rail = { fly, show, hideSoon, hide };
  const pageLink = (page: Page) => {
    const active = currentHref === page.href;
    return (
      <li key={page.href}>
        <Link
          href={page.href}
          aria-current={active ? 'page' : undefined}
          className={cn('mx-1.5 flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm text-ink-soft hover:bg-surface-soft hover:text-ink', active && flyActive)}
        >
          <page.icon className="size-4.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate">{page.label}</span>
          <Count n={counts[page.href] ?? 0} />
        </Link>
      </li>
    );
  };

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3.5 py-6 scrollbar-none">
      {pinnedPages.length > 0 && (
        <div className="mb-2 flex flex-col gap-1 border-b border-rail-border pb-3">
          {pinnedPages.map((page) => (
            <RailItem
              rail={rail}
              key={`pin:${page.href}`}
              id={`pin:${page.href}`}
              icon={page.icon}
              href={page.href}
              active={currentHref === page.href}
              dot={(counts[page.href] ?? 0) > 0}
              title={page.label}
            />
          ))}
        </div>
      )}
      {groups.map((group) => {
        if (group.pages.length === 1) {
          const page = group.pages[0]!;
          return <RailItem rail={rail} key={group.label} id={group.label} icon={page.icon} href={page.href} active={currentHref === page.href} dot={(counts[page.href] ?? 0) > 0} title={page.label} />;
        }
        const waiting = group.pages.some((p) => (counts[p.href] ?? 0) > 0);
        return (
          <RailItem rail={rail} key={group.label} id={group.label} icon={group.icon} active={currentGroup === group.label} dot={waiting} title={group.label}>
            <ul className="flex flex-col gap-0.5">{group.pages.map(pageLink)}</ul>
          </RailItem>
        );
      })}
      <div className="mt-auto pt-4">
        <RailItem rail={rail} id="expand" icon={ChevronDoubleRightIcon} active={false} title="Expand sidebar" onClick={onExpand} />
      </div>
    </nav>
  );
}

type RailState = { fly: { key: string; top: number; left: number } | null; show: (key: string, el: HTMLElement) => void; hideSoon: () => void; hide: () => void };

/** One rail icon with its fly-out: a link (`href`), an action (`onClick`), or a group whose `children` are its pages. */
function RailItem({
  rail,
  id,
  icon: IconOf,
  href,
  onClick,
  active,
  dot,
  title,
  children,
}: {
  rail: RailState;
  id: string;
  icon: Icon;
  href?: string;
  onClick?: () => void;
  active: boolean;
  dot?: boolean;
  title: string;
  children?: ReactNode;
}) {
  const { fly, show, hideSoon, hide } = rail;
  const isOpen = fly?.key === id;
  const flyId = `rail-${id.replace(/\W+/g, '-')}`;
  const trigger = cn(
    'relative flex h-11 w-full items-center justify-center rounded-lg text-rail-muted hover:bg-rail-hover hover:text-rail-ink',
    active ? 'bg-rail-active text-secondary hover:bg-rail-active' : isOpen && children && 'bg-rail-hover text-rail-ink',
  );
  const mark = (
    <>
      <span className="relative">
        <IconOf className="size-5" aria-hidden />
        {dot && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-rail bg-danger" aria-hidden />}
      </span>
      {/* a group's chevron: there is more beside it */}
      {children && (
        <ChevronRightIcon className={cn('absolute right-0.5 size-3 text-rail-muted transition-opacity duration-100', isOpen ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100')} aria-hidden />
      )}
    </>
  );
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.matches(':focus-visible') && !isOpen) show(id, event.currentTarget);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hide();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation();
    hide();
    event.currentTarget.querySelector<HTMLElement>('[data-rail-trigger]')?.focus();
  };
  return (
    <div className="group/rail" onPointerEnter={(e) => show(id, e.currentTarget)} onPointerLeave={hideSoon} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}>
      {href ? (
        <Link data-rail-trigger href={href} aria-current={active ? 'page' : undefined} aria-label={title} className={trigger} onClick={hide}>
          {mark}
        </Link>
      ) : (
        <button
          data-rail-trigger
          type="button"
          aria-label={title}
          aria-expanded={children ? isOpen : undefined}
          aria-controls={children && isOpen ? flyId : undefined}
          className={trigger}
          onClick={(e) => {
            if (!children) {
              hide();
              onClick?.();
            } else if (isOpen) hide();
            else show(id, e.currentTarget.parentElement!);
          }}
        >
          {mark}
        </button>
      )}
      {isOpen && fly && (
        <FlyOut id={flyId} top={fly.top} left={fly.left} onPick={hide} label={children ? title : undefined}>
          {children ?? <p className="whitespace-nowrap px-3 py-2 text-sm text-ink">{title}</p>}
        </FlyOut>
      )}
    </div>
  );
}

/**
 * The panel beside the rail: level with its icon, nudged up to stay in the window, and closed by
 * choosing a page in it.
 */
function FlyOut({ id, top, left, label, onPick, children }: { id: string; top: number; left: number; label?: string; onPick: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(top);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    // a group's list lines its title up with the icon; a name sits level with it
    const start = label ? top - 6 : top + 2;
    setY(Math.max(8, Math.min(start, window.innerHeight - h - 8)));
  }, [top, label]);
  return (
    <div
      ref={ref}
      id={id}
      role={label ? 'group' : 'tooltip'}
      aria-label={label}
      style={{ top: y, left }}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('a')) onPick();
      }}
      className={cn(dropdownPanel, 'fixed z-50', label ? 'w-60 py-2' : 'py-0')}
    >
      {label && <p className="px-4 pb-1.5 pt-1 text-[0.6875rem] font-medium uppercase tracking-wider text-hint">{label}</p>}
      {children}
    </div>
  );
}
