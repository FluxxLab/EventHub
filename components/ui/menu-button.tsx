'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { anchoredPanel, dropdownPanel, useAnchored } from '@/components/ui/use-anchored';
import type { HeroIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

export type MenuChoice = { label: string; hint?: string; icon?: HeroIcon; onSelect: () => void };

/**
 * A button that opens a short menu of choices ("Make a deck" → Cards or Table), with a chevron to
 * say so. Keyboard as RowActions: the arrow keys move, Escape closes and returns focus.
 */
export function MenuButton({ label, icon: Icon, choices, disabled }: { label: string; icon?: HeroIcon; choices: MenuChoice[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);
  useAnchored(open, button, panel, close);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
    } else if (e.key === 'Tab') close();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass({ style: 'outline', color: 'gray' })}
      >
        {Icon && <Icon className="size-4" />}
        {label}
        <ChevronDownIcon className={cn('size-4 transition-transform duration-[var(--motion-moderate)]', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div ref={panel} id={menuId} role="menu" aria-label={label} onKeyDown={onKey} className={cn(anchoredPanel, dropdownPanel, 'flex w-72 flex-col p-1')}>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                c.onSelect();
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-soft focus:bg-surface-soft"
            >
              {c.icon && <c.icon className="mt-0.5 size-4 shrink-0 text-ink-soft" />}
              <span className="flex flex-col">
                <span className="text-sm text-ink">{c.label}</span>
                {c.hint && <span className="text-xs text-hint">{c.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
