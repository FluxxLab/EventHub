import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tableScroll } from '@/components/ui/table-scroll';

afterEach(cleanup);

function Wide() {
  return (
    <div {...tableScroll}>
      <button type="button">Row action</button>
      <input aria-label="Search" />
    </div>
  );
}

describe('table scroll', () => {
  it('moves a wide table sideways with the arrow keys, but not while typing', () => {
    render(<Wide />);
    const box = screen.getByRole('region');
    Object.defineProperty(box, 'scrollWidth', { value: 1600 });
    Object.defineProperty(box, 'clientWidth', { value: 800 });
    const scrollTo = vi.fn();
    box.scrollTo = scrollTo;
    expect(box.tabIndex).toBe(0);
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' });
    // the second press carries on from where the first was heading
    expect(scrollTo.mock.calls.map((c) => (c[0] as { left: number }).left)).toEqual([160, 0]);
  });
});
