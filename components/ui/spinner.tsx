import { cn } from '@/lib/utils';

/**
 * A small turning ring for a button or line that is busy (signing in, saving, deleting). Drawn in
 * the text's own colour; still for anyone whose device asks for reduced motion.
 */
export function Spinner({ className }: { className?: string }) {
  // shows after a short delay, so a quick action never flickers one (see .spinner-delay)
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('spinner-delay size-4 shrink-0', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
