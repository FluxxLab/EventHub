import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SidePager, usePaged } from '@/components/ui/side-pager';

function List({ n, filter = 'a' }: { n: number; filter?: string }) {
  const items = Array.from({ length: n }, (_, i) => `Row ${i + 1}`);
  const paged = usePaged(items, filter);
  return (
    <SidePager page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} label="Rows">
      <ul>
        {paged.slice.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </SidePager>
  );
}

afterEach(cleanup);

describe('side pager', () => {
  it('shows five at a time and moves on with the side arrows', () => {
    render(<List n={12} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']);
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toBe('Row 6');
    expect(screen.getByText('6–10 of 12 · page 2 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Row 11', 'Row 12']);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowLeft' });
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
});
