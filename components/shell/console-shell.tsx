'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { BreadcrumbProvider, Breadcrumbs } from '@/components/shell/breadcrumbs';
import { usePathname } from 'next/navigation';
import { NavMenu } from '@/components/shell/nav-menu';
import { OpsAlerts } from '@/components/shell/ops-alerts';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import type { StaffUser } from '@/lib/auth/session';
import { navFor, titleFor } from '@/lib/nav';
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
 * Sidebar, navbar and the page. The sidebar is a narrow rail of icons, each showing its pages
 * beside it on hover; expanded (and remembered), it pushes the navbar and page along with it. Below `md` it gives way to the
 * navbar's menu button.
 */
export function ConsoleShell({ user, children }: { user: StaffUser; children: ReactNode }) {
  const groups = navFor(user.tier);
  const pathname = usePathname();
  const [pinned, setPinned] = useState(readPinned);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // the browser tab names the page, so a row of console tabs can be told apart
  useEffect(() => {
    const title = titleFor(pathname);
    document.title = title === 'PIC Events' ? 'PIC Events Admin' : `${title} · PIC Events Admin`;
  }, [pathname]);

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
      <div data-console className="flex min-h-screen bg-canvas">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        {/* Opening (by hover or pin) widens this column, so the navbar and page move with the sidebar. */}
        <div className={cn('sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 ease-out md:block', pinned ? 'w-75' : 'w-18')}>
          <Sidebar user={user} groups={groups} pinned={pinned} onTogglePin={togglePin} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} onMenu={() => setMenuOpen(true)} />
          <OpsAlerts />
          {/* the page: a PIC event photo held still behind it, washed pale so the white panels and text read */}
          <main id="content" tabIndex={-1} className="min-w-0 flex-1 page-photo px-4 py-6 focus:outline-none sm:px-7">
            {/* where the page sits, above its content rather than in the navbar */}
            {/* one width for every page, the breadcrumb aligned with the content under it */}
            <div className="mx-auto w-full max-w-[90rem]">
              <Breadcrumbs pathname={pathname} className="mb-4" />
              <PageEntrance key={pathname}>{children}</PageEntrance>
            </div>
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

/**
 * A page as it opens: a quiet fade, and for its first moment (`data-entering`) its panels, figure
 * cards and first table rows rise in one after another (see .page-in in globals.css). Content that
 * arrives later, or changes with a filter, appears at once.
 */
function PageEntrance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // number what has arrived in reading order, each batch (first paint, then the data) from the top
    const seen = new WeakSet<Element>();
    const number = () => {
      let n = 0;
      for (const el of root.querySelectorAll<HTMLElement>('[data-panel], [data-figure], tbody > tr')) {
        if (seen.has(el)) continue;
        seen.add(el);
        el.style.setProperty('--stagger', String(Math.min(n++, 6)));
      }
    };
    number();
    const observer = new MutationObserver(number);
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      setEntering(false);
    }, 1200);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={ref} className="page-in" data-entering={entering || undefined}>
      {children}
    </div>
  );
}
