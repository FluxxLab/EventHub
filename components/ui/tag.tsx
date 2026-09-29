import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type TagTone = 'gray' | 'primary' | 'green' | 'danger' | 'gold';

/** The design system's tag: 18px pill, 1px border, pale fill, 12px text, optional 6px dot. */
const TONES: Record<TagTone, { pill: string; dot: string }> = {
  gray: { pill: 'border-border bg-[#f6f6f6] text-muted', dot: 'bg-muted' },
  primary: { pill: 'border-primary bg-primary-soft text-primary', dot: 'bg-primary' },
  green: { pill: 'border-success bg-success-soft text-success', dot: 'bg-success' },
  danger: { pill: 'border-danger bg-danger-soft text-danger', dot: 'bg-danger' },
  gold: { pill: 'border-gold bg-secondary-soft text-gold', dot: 'bg-gold' },
};

export function Tag({ tone = 'gray', dot = false, children, className }: { tone?: TagTone; dot?: boolean; children: ReactNode; className?: string }) {
  const style = TONES[tone];
  return (
    <span className={cn('inline-flex h-[18px] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-normal leading-none', style.pill, className)}>
      {dot && <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />}
      {children}
    </span>
  );
}
