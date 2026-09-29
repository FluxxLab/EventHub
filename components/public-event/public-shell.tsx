import Image from 'next/image';
import type { ReactNode } from 'react';

import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/config';
import { cn } from '@/lib/utils';

/** Keyboard focus for the public pages: the console removes outlines globally, so a ring instead. */
export const focusRing = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft';

/**
 * The frame of the no-login pages a shared link opens: the PIC mark on navy, the content, and a
 * footer. Server component; no console chrome, no session.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-soft text-ink">
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Image src="/pic-logo.png" alt="" width={36} height={36} priority className="rounded bg-on-primary p-0.5" />
          <span className="text-base font-medium">PIC Events</span>
        </div>
        <div className="h-1 bg-secondary" aria-hidden="true" />
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-divider bg-surface">
        <p className="mx-auto w-full max-w-3xl px-4 py-5 text-xs text-muted sm:px-6">Policy Innovation Centre · PIC Events</p>
      </footer>
    </div>
  );
}

/**
 * "Open in the app" plus the store links. The deep link only does something where the app is
 * installed, so the stores sit right under it for everyone else.
 */
export function AppLinks({ appHref, className }: { appHref: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <a
        href={appHref}
        className={cn(
          'inline-flex h-12 items-center justify-center rounded-md bg-secondary px-5 text-base font-medium text-primary transition-colors hover:bg-secondary/85',
          focusRing,
        )}
      >
        Open in the PIC Events app
      </a>
      <p className="text-sm text-muted">Don’t have the app yet?</p>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <StoreLink href={APP_STORE_URL} store="App Store" />
        <StoreLink href={PLAY_STORE_URL} store="Google Play" />
      </div>
    </div>
  );
}

function StoreLink({ href, store }: { href: string | null; store: string }) {
  const body = (
    <>
      <span className="text-[11px] leading-none text-muted">{href ? (store === 'App Store' ? 'Download on the' : 'Get it on') : 'Coming soon to'}</span>
      <span className="text-sm leading-tight font-medium">{store}</span>
    </>
  );
  const base = 'flex h-12 flex-col items-center justify-center gap-1 rounded-md border px-3';
  if (!href) {
    return <div className={cn(base, 'border-border bg-surface text-muted')}>{body}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, 'border-ink bg-ink text-surface transition-colors hover:bg-ink/90 [&>span:first-child]:text-surface/80', focusRing)}
    >
      {body}
    </a>
  );
}
