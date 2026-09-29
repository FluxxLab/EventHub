import type { ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The design system's modal, shared by every dialog in the console: a #FDFDFD card with a #DCDCDC
 * border, 12px corners and the lg shadow; a 48px icon box beside a 20px title, grey 14px copy under
 * it; and Cancel (grey) with the main action sharing the width, stacked on a phone.
 */
export const MODAL_WIDTH = { sm: 'max-w-[22rem]', md: 'max-w-lg', lg: 'max-w-3xl' } as const;

export function modalClass(width: keyof typeof MODAL_WIDTH = 'md', className?: string) {
  return cn(
    'm-auto w-[calc(100%-2.5rem)] overflow-hidden rounded-xl border border-[#dcdcdc] bg-[#fdfdfd] p-0 text-left text-ink',
    'shadow-lg backdrop:bg-ink/40',
    MODAL_WIDTH[width],
    className,
  );
}

/** Icon and title on one row, the explanation under them. */
export function ModalHeader({ icon: Icon, iconClassName, title, titleId, subtitle, subtitleId }: { icon: HeroIcon; iconClassName?: string; title: ReactNode; titleId: string; subtitle?: ReactNode; subtitleId?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg p-1" aria-hidden>
          <Icon className={cn('size-10 text-ink', iconClassName)} strokeWidth={1.25} />
        </span>
        <h2 id={titleId} className="text-xl font-medium leading-[30px] text-ink">
          {title}
        </h2>
      </div>
      {subtitle && (
        <div id={subtitleId} className="text-sm leading-5 text-[#7c7c7c]">
          {subtitle}
        </div>
      )}
    </div>
  );
}

/** Cancel first, the main action second; side by side at equal width, stacked on a phone. */
export function ModalActions({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-3 pt-1.5 sm:grid sm:grid-flow-col sm:auto-cols-fr [&>*]:w-full', className)}>{children}</div>;
}

/** The grey Cancel from the design (#F1F1F1). */
export const cancelClass = buttonClass({ style: 'soft', color: 'gray', className: 'px-5' });
