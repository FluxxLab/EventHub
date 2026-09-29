'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect } from 'react';

import type { NavGroup } from '@/lib/nav';
import { pageFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Every page the signed-in tier may open, grouped. The top bar's Menu button opens it. */
export function NavMenu({ groups, open, onClose }: { groups: NavGroup[]; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const current = pageFor(pathname)?.page.href;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="All pages">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <nav className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium uppercase tracking-wide text-muted">All pages</p>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-2 text-muted hover:bg-surface-soft">
            <XMarkIcon className="size-4.5" />
          </button>
        </div>
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted">{group.label}</p>
            <ul>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={onClose}
                    aria-current={current === page.href ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink hover:bg-surface-soft',
                      current === page.href && 'bg-primary-soft text-primary',
                    )}
                  >
                    <page.icon className="size-4.5" />
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
