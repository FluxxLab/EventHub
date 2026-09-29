'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The design system's tooltip: 12px text in a 4px-cornered pill, optional 16px icon, and a 12×6
 * arrow pointing at what it describes. Fill or soft, in grey, blue or green. It shows on hover and
 * on keyboard focus, and the described element names it through aria-describedby.
 */
const TONES = {
  gray: { fill: 'bg-ink text-[#fdfdfd]', soft: 'bg-[#f6f6f6] text-ink' },
  blue: { fill: 'bg-[#51c0ff] text-[#fdfdfd]', soft: 'bg-[#edf9ff] text-ink' },
  green: { fill: 'bg-[#10a957] text-[#fdfdfd]', soft: 'bg-[#effef5] text-ink' },
} as const;

/** Where the tooltip sits relative to its element, and which end its arrow is at. */
export type TooltipSide = 'top' | 'bottom';
export type TooltipAlign = 'start' | 'center' | 'end';

const ALIGN = { start: 'left-0', center: 'left-1/2 -translate-x-1/2', end: 'right-0' } as const;
const ARROW_ALIGN = { start: 'left-2.5', center: 'left-1/2 -translate-x-1/2', end: 'right-2.5' } as const;

export function Tooltip({
  label,
  icon: Icon,
  side = 'top',
  align = 'center',
  tone = 'gray',
  variant = 'fill',
  className,
  children,
}: {
  label: ReactNode;
  icon?: HeroIcon;
  side?: TooltipSide;
  align?: TooltipAlign;
  tone?: keyof typeof TONES;
  variant?: 'fill' | 'soft';
  className?: string;
  /** One focusable element (a button or link) the tooltip describes. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const colours = TONES[tone][variant];
  const trigger = isValidElement(children) ? cloneElement(children, { 'aria-describedby': id }) : children;
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none invisible absolute z-40 flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs leading-[18px] opacity-0 transition-opacity duration-100',
          'group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          ALIGN[align],
          colours,
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        {label}
        {/* the arrow: a 12x6 triangle in the tooltip's own colour */}
        <span
          aria-hidden
          className={cn('absolute h-1.5 w-3', side === 'top' ? 'top-full [clip-path:polygon(0_0,100%_0,50%_100%)]' : 'bottom-full [clip-path:polygon(50%_0,100%_100%,0_100%)]', ARROW_ALIGN[align], colours)}
        />
      </span>
    </span>
  );
}
