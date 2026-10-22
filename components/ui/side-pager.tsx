'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const PAGE_SIZE = 5;

/**
 * A list shown a page at a time. `resetKey` sends it back to the first page when the list itself
 * changes (another day, tab or filter); the page also stays in range when items go.
 */
export function usePaged<T>(items: T[], resetKey: string, size = PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = state.key === resetKey ? Math.min(state.page, pages - 1) : 0;
  const setPage = (p: number) => setState({ key: resetKey, page: Math.max(0, Math.min(p, pages - 1)) });
  return { page, pages, size, total: items.length, slice: items.slice(page * size, (page + 1) * size), setPage };
}

const sideButton =
  'absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-md transition hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-30';

/**
 * A page of rows with arrows on either side: › moves on to the next page, ‹ back. The arrows sit in
 * gutters beside the rows, so they never cover a row's own buttons. ←/→ do the same from the keyboard.
 */
export function SidePager({ page, pages, total, size, onPage, label, children }: { page: number; pages: number; total: number; size: number; onPage: (page: number) => void; label: string; children: ReactNode }) {
  if (pages <= 1) return <>{children}</>;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div
      className="relative px-11"
      role="group"
      aria-label={`${label}, page ${page + 1} of ${pages}`}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input, textarea, select, [role=listbox], [role=menu]')) return;
        if (e.key === 'ArrowRight' && page < pages - 1) onPage(page + 1);
        if (e.key === 'ArrowLeft' && page > 0) onPage(page - 1);
      }}
    >
      <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className={cn(sideButton, 'left-1')}>
        <ChevronLeftIcon className="size-5" />
      </button>
      <div key={page} className="animate-[pager-in_220ms_ease-out]">
        {children}
      </div>
      <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className={cn(sideButton, 'right-1')}>
        <ChevronRightIcon className="size-5" />
      </button>
      <p className="py-3 text-center text-sm text-ink-soft" aria-live="polite">
        {from}–{to} of {total} · page {page + 1} of {pages}
      </p>
    </div>
  );
}
