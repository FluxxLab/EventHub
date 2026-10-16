'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * More of something, eased open and shut ("Show all", "Show all comments"): the height grows from
 * nothing as the sidebar's groups do. While shut its content is out of the Tab order.
 */
export function Reveal({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className="group-collapse" data-open={open}>
      <div className={className} inert={!open}>
        {children}
      </div>
    </div>
  );
}

/** How long a save button says "Saved" before going back to its label. */
const SAVED_MS = 1600;

/**
 * True for a moment after a mutation succeeds, for a save button to confirm in place. Pass the
 * mutation (TanStack's `isSuccess` and `submittedAt`); each new save starts the moment again.
 */
export function useJustSaved(mutation: { isSuccess: boolean; submittedAt: number }) {
  const [savedAt, setSavedAt] = useState(0);
  const { isSuccess, submittedAt } = mutation;
  useEffect(() => {
    if (!isSuccess) return;
    const on = setTimeout(() => setSavedAt(submittedAt), 0);
    const off = setTimeout(() => setSavedAt(0), SAVED_MS);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [isSuccess, submittedAt]);
  return isSuccess && savedAt === submittedAt && savedAt !== 0;
}

/** A save button's label: "Saving…" while it runs, a tick and "Saved" just after, else its own. */
export function SaveLabel({ pending, saved, children, className }: { pending: boolean; saved: boolean; children: ReactNode; className?: string }) {
  if (pending) return <>Saving…</>;
  if (saved)
    return (
      <span className={cn('pop-in inline-flex items-center gap-1.5', className)}>
        <CheckIcon className="check-pop size-4" aria-hidden />
        Saved
      </span>
    );
  return <>{children}</>;
}
