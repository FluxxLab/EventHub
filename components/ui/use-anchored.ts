'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Pins an open popover under its trigger (or above it, when there is no room below) with fixed
 * positioning, so a scrolling container such as a dialog body never clips it. The panel is placed
 * by writing its style directly, and follows the trigger on scroll and resize. Clicking outside
 * both calls `onDismiss`.
 */
export function useAnchored(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = panel.current;
      if (!a || !p) return;
      const gap = 4;
      const height = p.offsetHeight;
      const roomBelow = window.innerHeight - a.bottom;
      const top = roomBelow < height + gap && a.top > roomBelow ? a.top - height - gap : a.bottom + gap;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - p.offsetWidth - 8));
      Object.assign(p.style, { position: 'fixed', top: `${top}px`, left: `${left}px`, minWidth: `${a.width}px`, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, panel]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) onDismiss();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, anchor, panel, onDismiss]);
}

/** Classes every anchored panel starts with: fixed, hidden until placed, above dialogs' content. */
export const anchoredPanel = 'invisible fixed z-50';

/** The dropdown panel from the design system: #DCDCDC border, 8px corners, the "lg" shadow. */
export const dropdownPanel =
  'rounded-lg border border-border bg-surface shadow-lg';

/** One 36px row in a dropdown: 8px 10px padding, 8px corners, 14px #525252 text. */
export const dropdownItem = 'flex h-9 w-full items-center gap-1.5 rounded-lg px-2.5 text-left text-sm text-[#525252]';
