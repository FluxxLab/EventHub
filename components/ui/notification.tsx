import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/shell/avatar';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

export type NotificationLeading = { kind: 'icon'; icon: HeroIcon; tone?: 'ink' | 'success' | 'danger' } | { kind: 'avatar'; name: string; src?: string | null };

export type NotificationAction = { label: string; onClick: () => void; primary?: boolean };

const ICON_TONE = { ink: 'text-ink', success: 'text-success', danger: 'text-danger' } as const;

/**
 * The design system's notification card: #F6F6F6, #DCDCDC border, 8px corners, "lg" shadow,
 * 20px padding. An optional avatar or icon leads; then an 18px title with a grey time beside it,
 * the body, and up to two text actions. The ✕ sits top-right.
 */
export function Notification({
  leading,
  title,
  meta,
  children,
  actions = [],
  onClose,
  className,
}: {
  leading?: NotificationLeading;
  title: string;
  /** Short grey text beside the title, usually when it happened. */
  meta?: string;
  children?: ReactNode;
  actions?: NotificationAction[];
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex gap-3 rounded-lg border border-border bg-[#f6f6f6] p-5 shadow-lg',
        className,
      )}
    >
      {leading?.kind === 'avatar' && (
        <span className="shrink-0 rounded-full border-[3px] border-surface">
          <Avatar name={leading.name} src={leading.src} size={40} />
        </span>
      )}
      {leading?.kind === 'icon' && (
        <span className="flex size-12 shrink-0 items-center justify-center">
          <leading.icon className={cn('size-10', ICON_TONE[leading.tone ?? 'ink'])} />
        </span>
      )}

      <div className={cn('flex min-w-0 flex-1 flex-col gap-4', onClose && 'pr-6')}>
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-lg font-medium leading-none text-ink">{title}</span>
          {meta && <span className="text-sm text-[#7c7c7c]">{meta}</span>}
        </p>
        {children && <div className="text-sm leading-[1.5] text-[#525252]">{children}</div>}
        {actions.length > 0 && (
          <div className="flex gap-4">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={cn('rounded text-sm text-ink hover:underline', action.primary && 'font-medium')}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="absolute right-5 top-5 flex size-5 items-center justify-center rounded text-[#525252] hover:text-ink"
        >
          <XMarkIcon className="size-5" />
        </button>
      )}
    </div>
  );
}
