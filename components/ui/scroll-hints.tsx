'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const button =
  'pointer-events-auto absolute top-2.5 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-md transition hover:bg-primary-soft';

/**
 * ‹ › at the edges of a wide table's header, to slide it sideways without the scrollbar at the
 * bottom. Put it first inside the table's scroll box: it sticks to the visible edges as the table
 * moves, and each arrow shows only while there is more to see that way.
 */
export function ScrollHints() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const measure = () => setEdges({ left: box.scrollLeft > 4, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 4 });
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(box);
    for (const child of Array.from(box.children)) resize.observe(child);
    return () => {
      box.removeEventListener('scroll', measure);
      resize.disconnect();
    };
  }, []);

  const slide = (dir: 1 | -1) => {
    const box = ref.current?.parentElement;
    if (box) box.scrollBy({ left: dir * Math.max(200, box.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div ref={ref} className="pointer-events-none sticky left-0 z-20 h-0 w-full">
      <button type="button" tabIndex={-1} aria-label="Scroll the table left" onClick={() => slide(-1)} className={cn(button, 'left-2', !edges.left && 'hidden')}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <button type="button" tabIndex={-1} aria-label="Scroll the table right" onClick={() => slide(1)} className={cn(button, 'right-2', !edges.right && 'hidden')}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
