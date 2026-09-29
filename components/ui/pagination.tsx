'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

import { pageItems } from '@/lib/pagination';
import { cn } from '@/lib/utils';

const item = 'inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded px-3 text-sm text-ink transition-colors hover:bg-[#f6f6f6] disabled:pointer-events-none disabled:opacity-40';

/**
 * The design system's pagination: Previous, the page numbers (the current one on #F1F1F1, gaps as
 * "…"), Next. On a phone Previous and Next shrink to arrows and fewer numbers show.
 */
export function Pagination({ page, pages, onChange, label = 'Pages', className }: { page: number; pages: number; onChange: (page: number) => void; label?: string; className?: string }) {
  if (pages <= 1) return null;
  const go = (n: number) => onChange(Math.min(pages, Math.max(1, n)));
  const numbers = (siblings: number) =>
    pageItems(page, pages, siblings).map((n, i) =>
      n === null ? (
        <span key={`gap-${i}`} className="px-1 text-sm text-ink" aria-hidden>
          …
        </span>
      ) : (
        <button key={n} type="button" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} className={cn(item, n === page && 'bg-[#f1f1f1] hover:bg-[#f1f1f1]')}>
          {n}
        </button>
      ),
    );

  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-2 px-6 py-4 sm:justify-center sm:px-4 sm:py-3', className)}>
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" className={item}>
        <ChevronLeftIcon className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <div className="flex items-center gap-2 sm:hidden">{numbers(0)}</div>
      <div className="hidden items-center gap-2 sm:flex">{numbers(1)}</div>
      <button type="button" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page" className={item}>
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon className="size-4" />
      </button>
    </nav>
  );
}
