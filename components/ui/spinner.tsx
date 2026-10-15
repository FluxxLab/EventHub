import { cn } from '@/lib/utils';

/**
 * A small turning ring for a button or line that is busy (signing in, saving, deleting). Drawn in
 * the text's own colour; still for anyone whose device asks for reduced motion.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('size-4 shrink-0 motion-safe:animate-spin', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
