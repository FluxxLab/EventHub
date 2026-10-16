'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

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

/**
 * Where the chosen tab sits in its list, so one marker (the underline, the raised pill) can slide
 * between tabs rather than jump. Measured again when the list resizes; null until measured, when
 * the chosen tab draws its own marker.
 */
function useIndicator(list: RefObject<HTMLDivElement | null>, value: string) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const tab = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      setBox(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [list, value]);
  return box;
}

/** The marker's slide: Carbon's moderate step. */
const slide = 'transition-[transform,width] duration-[var(--motion-slow)] ease-[var(--ease-standard)] motion-reduce:transition-none';

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
  const box = useIndicator(list, value);
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-soft p-1 scrollbar-none [&>*]:shrink-0', className)}
    >
      {box && (
        <span
          aria-hidden
          className={cn('absolute inset-y-1 left-0 rounded-md bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.08)]', slide)}
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
        />
      )}
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
              'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              selected ? cn('font-medium text-ink', !box && 'bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.08)]') : 'text-ink-soft hover:text-ink',
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
  const box = useIndicator(list, value);
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative flex gap-6 overflow-x-auto border-b border-border scrollbar-none [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]', className)}
    >
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
              selected ? cn('font-medium text-primary', box ? 'border-transparent' : 'border-primary') : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden />}
            {o.label}
            {o.count !== undefined && <Tag tone={selected ? 'primary' : 'gray'}>{o.count}</Tag>}
          </button>
        );
      })}
      {box && <span aria-hidden className={cn('absolute bottom-0 left-0 h-0.5 bg-primary', slide)} style={{ width: box.width, transform: `translateX(${box.left}px)` }} />}
    </div>
  );
}

export const tabId = (base: string, value: string) => `${base}-tab-${value}`;
export const tabPanelId = (base: string, value: string) => `${base}-panel-${value}`;
