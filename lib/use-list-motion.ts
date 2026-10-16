'use client';

import type { AutoAnimationPlugin } from '@formkit/auto-animate';
import { useAutoAnimate } from '@formkit/auto-animate/react';

/** The motion tokens in globals.css, in numbers for the Web Animations API. */
const MOVE_MS = 200;
const LEAVE_MS = 150;
const STANDARD = 'cubic-bezier(0.2, 0, 0.38, 0.9)';
const EXIT = 'cubic-bezier(0.2, 0, 1, 0.9)';

/**
 * Items that move slide to their new place, items that go fade out where they were. Items that
 * arrive just appear: a filter, a search or a refresh changes the list at once, and a page's first
 * rows already rise in with the page (see PageEntrance).
 */
const listMotion: AutoAnimationPlugin = (el, action, first, second) => {
  if (action === 'remain' && first && second) {
    const dx = first.left - second.left;
    const dy = first.top - second.top;
    if (!dx && !dy) return new KeyframeEffect(el, [], { duration: 0 });
    return new KeyframeEffect(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: MOVE_MS, easing: STANDARD });
  }
  if (action === 'remove') {
    return new KeyframeEffect(
      el,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.98)' },
      ],
      { duration: LEAVE_MS, easing: EXIT },
    );
  }
  return new KeyframeEffect(el, [], { duration: 0 });
};

/**
 * Put the returned ref on a list's parent (a `ul`, a `tbody`, a grid of cards) so its reorders and
 * removals are animated. Keyed children only; a device asking for reduced motion gets none.
 */
export function useListMotion<T extends HTMLElement>() {
  const [ref] = useAutoAnimate<T>(listMotion);
  return ref;
}
