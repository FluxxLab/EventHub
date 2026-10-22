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

/** The page numbers to show (0-based), with null for a gap: the first, the last, and the current one's neighbours. */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, page - 1, page, page + 1]);
  if (page <= 2) [1, 2, 3].forEach((p) => keep.add(p));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((p) => keep.add(p));
  const sorted = [...keep].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const pageButton = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40';

/**
 * Rows a page at a time, with the pagination bar under them: "Showing 6–10 of 32" on the left;
 * Previous, the page numbers and Next on the right.
 */
export function SidePager({ page, pages, total, size, onPage, label, children }: { page: number; pages: number; total: number; size: number; onPage: (page: number) => void; label: string; children: ReactNode }) {
  if (pages <= 1) return <>{children}</>;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <>
      {children}
      <nav aria-label={`${label} pages`} className="flex flex-col items-center justify-between gap-3 border-t border-border px-6 py-3 sm:flex-row">
        <p className="text-sm text-ink-soft" aria-live="polite">
          Showing <span className="font-medium text-ink">{from}</span>–<span className="font-medium text-ink">{to}</span> of <span className="font-medium text-ink">{total}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className={cn(pageButton, 'border-border bg-surface text-ink hover:bg-canvas')}>
            <ChevronLeftIcon className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          {pageNumbers(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-hint" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-label={`Page ${p + 1}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
                className={cn(pageButton, p === page ? 'border-primary bg-primary font-medium text-white' : 'border-border bg-surface text-ink hover:bg-canvas')}
              >
                {p + 1}
              </button>
            ),
          )}
          <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className={cn(pageButton, 'border-border bg-surface text-ink hover:bg-canvas')}>
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </nav>
    </>
  );
}
