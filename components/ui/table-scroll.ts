import type { KeyboardEvent } from 'react';

const STEP = 160;
/** Where each box is heading, so quick presses add up instead of restarting the glide. */
const heading = new WeakMap<HTMLElement, { left: number; at: number }>();

/** ← → move a wide table sideways, from the table itself or anything in it but a text box or an open list. */
function scrollOnArrows(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable=true], [role=listbox], [role=menu], [role=slider]')) return;
  const box = e.currentTarget;
  if (box.scrollWidth <= box.clientWidth) return;
  e.preventDefault();
  const last = heading.get(box);
  const from = last && Date.now() - last.at < 400 ? last.left : box.scrollLeft;
  const left = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, from + (e.key === 'ArrowRight' ? STEP : -STEP)));
  heading.set(box, { left, at: Date.now() });
  box.scrollTo({ left, behavior: 'smooth' });
}

/**
 * Spread on a table's horizontal scroll box: it can take focus (a click on the table or Tab), so
 * the keyboard's ← → move the table left and right, with a focus ring to show it has them.
 */
export const tableScroll = {
  tabIndex: 0,
  role: 'region',
  'aria-label': 'Table. Use the left and right arrow keys to scroll sideways.',
  onKeyDown: scrollOnArrows,
} as const;

/** The focus ring for a table's scroll box. */
export const tableScrollFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
