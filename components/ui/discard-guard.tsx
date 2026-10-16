'use client';

import { useEffect, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Asks before a form with unsaved changes is thrown away. `requestClose` is what Cancel, the
 * close button and Escape call: with nothing changed it closes at once; with changes it shows
 * `prompt` ("Discard your changes?") and closes only on Discard. While the form is open with
 * changes, leaving or reloading the page asks too. Used by FormDialog and by dialogs built on the
 * modal parts directly.
 */
export function useDiscardGuard({ open, dirty, pending = false, onClose }: { open: boolean; dirty: boolean; pending?: boolean; onClose: () => void }) {
  const [asking, setAsking] = useState(false);
  // nothing to discard any more (saved, undone): stop asking
  if (asking && (!dirty || !open)) setAsking(false);

  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);

  const requestClose = () => {
    if (pending) return;
    if (dirty && !asking) return setAsking(true);
    setAsking(false);
    onClose();
  };

  const prompt = asking ? (
    <div role="alert" className={cn('pop-in flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning')}>
      <span>Discard your changes?</span>
      <span className="flex gap-2">
        <button type="button" onClick={() => setAsking(false)} className={buttonClass({ style: 'outline', color: 'gray' })}>
          Keep editing
        </button>
        <button type="button" onClick={requestClose} className={buttonClass({ color: 'danger' })}>
          Discard
        </button>
      </span>
    </div>
  ) : null;

  return { requestClose, prompt, asking };
}
