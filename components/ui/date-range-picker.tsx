'use client';

import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { fieldBox } from '@/components/ui/field';
import { anchoredPanel, dropdownPanel, useAnchored } from '@/components/ui/use-anchored';
import { addMonths, dayRangeLabel, fromKey, monthGrid, pickDay, shiftKey, toKey, type DayRange } from '@/lib/calendar';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * A date-range field: a button showing the chosen days, opening a month calendar. The first
 * click picks the start, the second the end (the same day twice is a one-day range), and it
 * closes once the range is complete. Arrow keys move between days, PageUp/PageDown between
 * months, Enter picks, Escape closes.
 */
export function DateRangePicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder = 'Select dates',
}: {
  id?: string;
  value: DayRange;
  onChange: (range: DayRange) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const at = value.start ? fromKey(value.start) : new Date();
    return { year: at.getFullYear(), month: at.getMonth() };
  });
  const [focusKey, setFocusKey] = useState(value.start || toKey(new Date()));
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useAnchored(open, buttonRef, panelRef, dismiss);

  // The focused day moves with the keyboard; keep the real focus on it.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusKey}"]`)?.focus();
  }, [open, focusKey, view]);

  const today = toKey(new Date());
  const cells = monthGrid(view.year, view.month);
  const monthLabel = new Date(view.year, view.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  // While only the start is picked, the hovered (or focused) day previews the end.
  const previewEnd = value.start && !value.end ? (hoverKey ?? focusKey) : null;
  const lo = value.start;
  const hi = value.end || (previewEnd && previewEnd >= value.start ? previewEnd : '');

  const show = () => {
    const at = value.start ? fromKey(value.start) : new Date();
    setView({ year: at.getFullYear(), month: at.getMonth() });
    setFocusKey(value.start || today);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const pick = (day: string) => {
    const next = pickDay(value, day);
    onChange(next);
    if (next.end) close();
  };
  const moveTo = (key: string) => {
    const date = fromKey(key);
    setView({ year: date.getFullYear(), month: date.getMonth() });
    setFocusKey(key);
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key in KEY_STEPS) {
      event.preventDefault();
      moveTo(shiftKey(focusKey, KEY_STEPS[event.key]!));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const date = fromKey(focusKey);
      date.setMonth(date.getMonth() + (event.key === 'PageDown' ? 1 : -1));
      moveTo(toKey(date));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // close the calendar, not the dialog around it
      close();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(fieldBox({ invalid, focused: open }), 'text-left')}
      >
        <CalendarDaysIcon className="size-5 shrink-0 text-[#525252]" />
        <span className={cn('flex-1 truncate', !value.start && 'text-placeholder')}>{value.start ? dayRangeLabel(value) : placeholder}</span>
        {invalid && <ExclamationCircleIcon className="size-4 shrink-0 text-danger" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose dates"
          onKeyDown={onGridKey}
          className={cn(anchoredPanel, dropdownPanel, 'w-76 px-3 pb-3 pt-4')}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v, -1))}
              aria-label="Previous month"
              className="flex size-8 items-center justify-center rounded text-muted hover:bg-surface-soft hover:text-ink"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <p className="text-sm font-medium text-ink" aria-live="polite">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v, 1))}
              aria-label="Next month"
              className="flex size-8 items-center justify-center rounded text-muted hover:bg-surface-soft hover:text-ink"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-muted" aria-hidden>
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div role="grid" aria-label={monthLabel} className="grid grid-cols-7" onMouseLeave={() => setHoverKey(null)}>
            {cells.map((key, i) => {
              if (!key) return <span key={`pad-${i}`} />;
              const isEdge = key === lo || key === hi;
              const inside = !!lo && !!hi && key > lo && key < hi;
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  data-day={key}
                  tabIndex={key === focusKey ? 0 : -1}
                  aria-selected={isEdge || inside}
                  aria-label={fromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHoverKey(key)}
                  onFocus={() => setFocusKey(key)}
                  className={cn(
                    'my-0.5 flex h-9 items-center justify-center text-sm text-ink',
                    inside && 'bg-primary-soft',
                    key === lo && hi && 'rounded-l-full bg-primary-soft',
                    key === hi && 'rounded-r-full bg-primary-soft',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full',
                      isEdge ? 'bg-primary text-on-primary' : 'hover:bg-surface-soft',
                      !isEdge && key === today && 'font-medium text-primary',
                    )}
                  >
                    {fromKey(key).getDate()}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">{value.start && !value.end ? 'Now pick the last day.' : 'Pick the first day.'}</p>
        </div>
      )}
    </>
  );
}
