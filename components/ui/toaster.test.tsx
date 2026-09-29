import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@/components/ui/toaster';

function Trigger({ duration }: { duration?: number }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.push({ title: 'Event added', body: 'Saved as a draft.', duration })}>
      show
    </button>
  );
}

const show = (duration?: number) => {
  render(
    <ToastProvider>
      <Trigger duration={duration} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'show' }));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('toasts', () => {
  it('closes itself after its duration', () => {
    show(1000);
    expect(screen.getByText('Event added')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('Event added')).toBeNull();
  });

  it('stays while the pointer is on it', () => {
    show(1000);
    fireEvent.pointerEnter(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Event added')).toBeTruthy();
    fireEvent.pointerLeave(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('Event added')).toBeNull();
  });

  it('closes on its ✕', () => {
    show(0);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Event added')).toBeNull();
  });
});
