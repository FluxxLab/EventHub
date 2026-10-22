import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageNumbers, SidePager, usePaged } from '@/components/ui/side-pager';

function List({ n, filter = 'a' }: { n: number; filter?: string }) {
  const items = Array.from({ length: n }, (_, i) => `Row ${i + 1}`);
  const paged = usePaged(items, filter);
  return (
    <SidePager page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} label="Rows">
      <ul>
        {paged.slice.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </SidePager>
  );
}

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no scrolling; the dropdown scrolls its chosen option into view
  Element.prototype.scrollIntoView = vi.fn();
});

describe('side pager', () => {
  it('shows five at a time with a pagination bar under them', () => {
    render(<List n={12} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']);
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 6');
    expect(screen.getByRole('navigation').textContent).toContain('Showing 6–10 of 12');
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 1');
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Row 11', 'Row 12']);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 6');
  });

  it('shows no arrows for five or fewer, and starts over when the filter changes', () => {
    const { rerender } = render(<List n={5} />);
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    rerender(<List n={12} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    rerender(<List n={12} filter="b" />);
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 1');
  });

  it('numbers the pages with gaps on a long list', () => {
    expect(pageNumbers(0, 3)).toEqual([0, 1, 2]);
    expect(pageNumbers(0, 20)).toEqual([0, 1, 2, 3, null, 19]);
    expect(pageNumbers(10, 20)).toEqual([0, null, 9, 10, 11, null, 19]);
    expect(pageNumbers(19, 20)).toEqual([0, null, 16, 17, 18, 19]);
  });

  it('shows more rows a page when asked, keeping the first row in view', () => {
    render(<List n={23} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 11');
    fireEvent.click(screen.getByRole('button', { name: 'Rows per page' }));
    fireEvent.click(screen.getByRole('option', { name: '10' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 11');
    expect(screen.getByRole('navigation').textContent).toContain('Showing 11–20 of 23');
  });
});
