import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * The PIC logo as the loading indicator: it breathes inside a slowly turning gold arc. With
 * reduced motion both stay still. Announced once to screen readers as "Loading".
 */
export function LogoLoader({ size = 104, label = 'Loading', className }: { size?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full motion-safe:animate-[spin_1.6s_linear_infinite]" aria-hidden>
        <circle cx={50} cy={50} r={46} fill="none" stroke="var(--primary-soft)" strokeWidth={3} />
        <circle cx={50} cy={50} r={46} fill="none" stroke="var(--secondary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="72 217" />
      </svg>
      <Image
        src="/pic-logo.png"
        alt=""
        width={size}
        height={size}
        priority
        className="motion-safe:animate-[logo-breathe_1.6s_ease-in-out_infinite]"
        style={{ width: size * 0.66, height: 'auto' }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
