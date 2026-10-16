'use client';

import { useId, useRef, type KeyboardEvent } from 'react';

import { Tag } from '@/components/ui/tag';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * The console's tabs, in two looks: `SegmentedTabs` (a pill switcher in a toolbar: status filters,
 * days) and `UnderlineTabs` (a page's sections). Both follow the WAI-ARIA tabs pattern: one tab
 * in the Tab order, arrow keys move between tabs, Home and End jump to the ends.
 * Pair with `useUrlParam` to keep the chosen tab in the address.
 */
export type TabOption<T extends string> = { value: T; label: string; count?: number; icon?: HeroIcon };

function useArrowKeys<T extends string>(options: TabOption<T>[], value: T, onChange: (v: T) => void) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = options.findIndex((o) => o.value === value);
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % options.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + options.length) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    onChange(options[to]!.value);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  };
  return { list, onKeyDown };
}

/** A pill switcher: the chosen option raised on a sunken track. Counts show as tags. */
export function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const { list, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex w-fit flex-wrap gap-1 rounded-lg bg-surface-soft p-1', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              selected ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-ink-soft hover:text-ink',
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden />}
            {o.label}
            {o.count !== undefined && <Tag tone={selected ? 'primary' : 'gray'}>{o.count}</Tag>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A page's sections, underlined. Give each panel `id={tabPanelId(idBase, value)}` and
 * `aria-labelledby={tabId(idBase, value)}` so the tab and its panel name each other.
 */
export function UnderlineTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  idBase,
  className,
}: {
  label: string;
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  idBase?: string;
  className?: string;
}) {
  const fallbackId = useId();
  const base = idBase ?? fallbackId;
  const { list, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex gap-6 overflow-x-auto border-b border-border', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            id={tabId(base, o.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelId(base, o.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors',
              selected ? 'border-primary font-medium text-primary' : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden />}
            {o.label}
            {o.count !== undefined && <Tag tone={selected ? 'primary' : 'gray'}>{o.count}</Tag>}
          </button>
        );
      })}
    </div>
  );
}

export const tabId = (base: string, value: string) => `${base}-tab-${value}`;
export const tabPanelId = (base: string, value: string) => `${base}-panel-${value}`;
