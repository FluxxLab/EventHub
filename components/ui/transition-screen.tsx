import { LogoLoader } from '@/components/ui/logo-loader';

/**
 * The whole screen while the console changes over: signing in, signing out. The PIC logo breathes
 * in its turning arc over a soft veil, so the step reads as happening rather than stalled.
 */
export function TransitionScreen({ label }: { label: string }) {
  return (
    <div className="screen-in fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-surface/95 backdrop-blur-sm">
      <LogoLoader size={96} label={label} />
      <p className="text-sm text-ink-soft" aria-hidden>
        {label}
      </p>
    </div>
  );
}
