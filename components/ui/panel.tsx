import { useId, type ReactNode } from 'react';

import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';

/**
 * The console's page panel: one bordered surface with a header strip (title, count, one-line
 * description, actions), an optional toolbar strip (tabs, search, filters), the body, and an
 * optional footer (pagination, a note). Every list and form page sits in one, so they match.
 *
 * Flat by design: a border, no shadow. Shadows are for things that float (menus, dialogs, toasts).
 */
export function Panel({
  title,
  count,
  badge,
  label,
  size = 'default',
  description,
  actions,
  toolbar,
  footer,
  className,
  bodyClassName,
  children,
}: {
  /** Shown as the panel's heading (h2); leave out for a panel that is only a body. */
  title?: ReactNode;
  /** A number beside the title: how many rows the panel holds. */
  count?: number;
  /** A status beside the title (a Tag: Live, On break, Draft). */
  badge?: ReactNode;
  /** The panel's name for screen readers when it has no visible title. */
  label?: string;
  /** `compact` for narrow side columns: smaller title and padding. */
  size?: 'default' | 'compact';
  /** One short line under the title. Keep it to a sentence. */
  description?: ReactNode;
  /** Buttons at the right of the header. */
  actions?: ReactNode;
  /** A strip under the header for tabs, search and filters. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const hasHeader = title !== undefined || actions !== undefined;
  const hasBelow = toolbar !== undefined || children !== undefined || footer !== undefined;
  const pad = size === 'compact' ? 'px-4' : 'px-6';
  return (
    <section
      data-panel
      aria-labelledby={title !== undefined ? `${id}-title` : undefined}
      aria-label={title === undefined ? label : undefined}
      className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}
    >
      {hasHeader && (
        <header className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-3', pad, size === 'compact' ? 'py-4' : 'py-5', hasBelow && 'border-b border-border')}>
          <div className="min-w-0">
            {title !== undefined && (
              <h2 id={`${id}-title`} className={cn('flex flex-wrap items-center gap-2 font-medium text-ink', size === 'compact' ? 'text-base' : 'text-lg')}>
                {title}
                {count !== undefined && <Tag tone="gray">{count}</Tag>}
                {badge}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-hint">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {toolbar && <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-border py-3', pad)}>{toolbar}</div>}
      {children !== undefined && <div className={bodyClassName}>{children}</div>}
      {footer && <footer className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 text-sm text-hint', pad)}>{footer}</footer>}
    </section>
  );
}
