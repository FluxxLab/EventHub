'use client';

import { useCallback, useState, type ReactNode } from 'react';

import { BreadcrumbProvider, Breadcrumbs } from '@/components/shell/breadcrumbs';
import { usePathname } from 'next/navigation';
import { NavMenu } from '@/components/shell/nav-menu';
import { OpsAlerts } from '@/components/shell/ops-alerts';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import type { StaffUser } from '@/lib/auth/session';
import { navFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Remembers, per browser, whether the organiser pinned the sidebar open. */
const PIN_KEY = 'pic.admin.sidebar-pinned';

function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false; // storage blocked (private mode, policy): start collapsed
  }
}

/**
 * Sidebar, navbar and the page. The sidebar is a narrow rail that opens to full width on hover
 * or when pinned, pushing the navbar and page along with it. Below `md` it gives way to the
 * navbar's menu button.
 */
export function ConsoleShell({ user, children }: { user: StaffUser; children: ReactNode }) {
  const groups = navFor(user.tier);
  const pathname = usePathname();
  const [pinned, setPinned] = useState(readPinned);
  const [peek, setPeek] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const togglePin = () =>
    setPinned((was) => {
      try {
        window.localStorage.setItem(PIN_KEY, was ? '0' : '1');
      } catch {
        // not remembered this time; the toggle still works
      }
      return !was;
    });

  return (
    <BreadcrumbProvider>
    <div className="flex min-h-screen bg-background">
      {/* Opening (by hover or pin) widens this column, so the navbar and page move with the sidebar. */}
      <div className={cn('sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 ease-out md:block', pinned || peek ? 'w-75' : 'w-18')}>
        <Sidebar user={user} groups={groups} pinned={pinned} peek={peek} onPeek={setPeek} onTogglePin={togglePin} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onMenu={() => setMenuOpen(true)} />
        <OpsAlerts />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7">
          {/* where the page sits, above its content rather than in the navbar */}
          <Breadcrumbs pathname={pathname} className="mb-4" />
          {children}
        </main>
        {/*
         * Pinned to the bottom of the window, within the content column so it never slides under
         * the sidebar; h-17 matches the sidebar's user row so the two top borders form one line.
         */}
        <footer className="sticky bottom-0 z-20 flex h-17 shrink-0 items-center justify-center border-t border-border bg-surface px-4 text-xs text-muted sm:px-7">
          Designed and maintained by Flux Eco
        </footer>
      </div>
      <NavMenu groups={groups} open={menuOpen} onClose={closeMenu} />
    </div>
    </BreadcrumbProvider>
  );
}
