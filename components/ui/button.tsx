import type { ButtonHTMLAttributes } from 'react';

import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The design system's buttons (size sm): 36px, 8×12px padding, 16px icon, 14px regular text,
 * 4px corners. Four styles, each in the console's colours: brand navy, the design's grey/ink,
 * danger red and success green.
 */
export type ButtonStyle = 'fill' | 'soft' | 'outline' | 'borderless';
export type ButtonColor = 'primary' | 'gray' | 'danger' | 'green';

const COLORS: Record<ButtonStyle, Record<ButtonColor, string>> = {
  fill: {
    primary: 'bg-primary text-on-primary hover:bg-primary/90',
    gray: 'bg-ink text-surface hover:bg-ink/90',
    danger: 'bg-danger text-on-primary hover:bg-danger/90',
    green: 'bg-success text-on-primary hover:bg-success/90',
  },
  soft: {
    primary: 'bg-primary-soft text-primary hover:bg-primary/15',
    gray: 'bg-[#f1f1f1] text-ink hover:bg-[#e6e6e6]',
    danger: 'bg-danger-soft text-danger hover:bg-danger/15',
    green: 'bg-success-soft text-success hover:bg-success/15',
  },
  outline: {
    primary: 'border border-primary text-primary hover:bg-primary-soft',
    gray: 'border border-border text-ink hover:bg-[#f1f1f1]',
    danger: 'border border-danger text-danger hover:bg-danger-soft',
    green: 'border border-success text-success hover:bg-success-soft',
  },
  borderless: {
    primary: 'text-primary hover:bg-primary-soft',
    gray: 'text-ink hover:bg-[#f1f1f1]',
    danger: 'text-danger hover:bg-danger-soft',
    green: 'text-success hover:bg-success-soft',
  },
};

/** The classes alone, for a <Link> or <a> that should look like a button. */
export function buttonClass({
  style = 'fill',
  color = 'primary',
  iconOnly = false,
  className,
}: { style?: ButtonStyle; color?: ButtonColor; iconOnly?: boolean; className?: string } = {}) {
  return cn(
    'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded text-sm font-normal whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
    iconOnly ? 'w-9' : 'px-3',
    COLORS[style][color],
    className,
  );
}

export function Button({
  variant = 'fill',
  color = 'primary',
  icon: Icon,
  trailingIcon: TrailingIcon,
  iconOnly = false,
  type = 'button',
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  /** Named `variant` because `style` is the DOM's inline-style prop. */
  variant?: ButtonStyle;
  color?: ButtonColor;
  icon?: HeroIcon;
  trailingIcon?: HeroIcon;
  /** Square, icon only; give it an aria-label. */
  iconOnly?: boolean;
}) {
  return (
    <button type={type} className={buttonClass({ style: variant, color, iconOnly, className })} {...props}>
      {Icon && <Icon className="size-4 shrink-0" />}
      {children}
      {TrailingIcon && <TrailingIcon className="size-4 shrink-0" />}
    </button>
  );
}
