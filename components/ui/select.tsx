'use client';

import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { fieldBox } from '@/components/ui/field';
import { anchoredPanel, dropdownItem, dropdownPanel, useAnchored } from '@/components/ui/use-anchored';
import { cn } from '@/lib/utils';

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * A styled single-choice dropdown (the listbox pattern) in place of the native <select>. Opens
 * on click, Enter, Space or the arrow keys; arrows, Home/End and typing a letter move through the
 * options; Enter picks; Escape or Tab closes.
 */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  invalid,
  describedBy,
  className,
  label,
}: {
  id?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  /** Accessible name when there is no <label htmlFor={id}>. */
  label?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const dismiss = useCallback(() => setOpen(false), []);
  useAnchored(open, buttonRef, listRef, dismiss);

  // Keep the highlighted option in view as it moves.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
    // Focus the list once it exists, so its key handler takes over.
    requestAnimationFrame(() => listRef.current?.focus());
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openAt(selectedIndex);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
      PageDown: Math.min(last, active + 8),
      PageUp: Math.max(0, active - 8),
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]!);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // close the list, not the dialog around it
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key.length === 1) {
      // Type-ahead: the next option starting with that letter.
      const letter = event.key.toLowerCase();
      const order = [...options.slice(active + 1), ...options.slice(0, active + 1)];
      const hit = order.find((o) => o.label.toLowerCase().startsWith(letter));
      if (hit) setActive(options.indexOf(hit));
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={describedBy}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={onButtonKey}
        className={cn(fieldBox({ invalid, focused: open }), 'justify-between text-left', className)}
      >
        <span className="truncate">{options[selectedIndex]?.label}</span>
        <ChevronDownIcon className={cn('size-4 shrink-0 text-ink transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={cn(anchoredPanel, dropdownPanel, 'flex max-h-80 flex-col gap-2 overflow-y-auto px-2 pb-3 pt-4')}
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(event) => event.preventDefault()} // keep focus on the list
                onClick={() => choose(i)}
                className={cn(dropdownItem, 'shrink-0 cursor-pointer justify-between', i === active && 'bg-surface-soft', selected && 'font-medium text-primary')}
              >
                {option.label}
                {selected && <CheckIcon className="size-5 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
