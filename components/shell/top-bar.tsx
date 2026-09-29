'use client';

import { usePathname } from 'next/navigation';
import { Bars3Icon } from '@heroicons/react/24/outline';

import { AccountMenu } from '@/components/shell/account-menu';
import { GlobalSearch } from '@/components/shell/global-search';
import { NotificationsMenu } from '@/components/shell/notifications-menu';
import type { StaffUser } from '@/lib/auth/session';
import { titleFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

const iconButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink hover:bg-surface-soft';

/** The navbar over the page: its title, global search, notifications and the account menu. */
export function TopBar({ user, onMenu }: { user: StaffUser; onMenu: () => void }) {
  const pathname = usePathname();
  const title = titleFor(pathname);
  const isAdmin = user.tier === 'admin';

  return (
    <header className="sticky top-0 z-30 flex h-22 shrink-0 items-center gap-6 border-b border-border bg-surface px-4 sm:px-7">
      <button type="button" onClick={onMenu} aria-label="Open menu" className={cn(iconButton, 'md:hidden')}>
        <Bars3Icon className="size-5" />
      </button>
      {/* Pages carry their own h1; the navbar title names the place, so it is not a heading. */}
      <p className="truncate text-2xl font-medium text-ink">{title}</p>

      {/* Search sits with the other tools on the right, at half its former width. */}
      <div className="ml-auto flex items-center gap-2.5">
        <GlobalSearch user={user} />
        {isAdmin && <NotificationsMenu />}
        <AccountMenu user={user} />
      </div>
    </header>
  );
}
