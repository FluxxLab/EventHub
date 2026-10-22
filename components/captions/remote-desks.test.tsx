import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
vi.mock('@/lib/captions/desk-remote', () => ({
  useRemoteDesks: () => ({
    data: [
      {
        deskId: 'd1',
        name: 'Behringer · ab12',
        connected: true,
        reportedAt: new Date().toISOString(),
        channels: [{ value: 'dev:0', label: 'Behringer · Ch 1' }],
        rooms: [
          { room: 'Main Hall', source: null, status: null, message: null },
          { room: 'Tamarind A', source: 'dev:0', status: 'capturing', message: null },
        ],
      },
    ],
  }),
  useDeskCommand: () => ({ mutate, pending: null }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ push: vi.fn() }) }));

import { RemoteDesks } from '@/components/captions/remote-desks';

afterEach(cleanup);
beforeEach(() => {
  mutate.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('remote desks', () => {
  it('patches and starts a room on the desk, and asks twice before stopping one', () => {
    render(<RemoteDesks />);
    const startButtons = screen.getAllByRole('button', { name: /Start/ });
    expect(startButtons[0]).toHaveProperty('disabled', true); // Main Hall has no channel yet
    fireEvent.click(screen.getByRole('button', { name: 'Channel for Main Hall' }));
    fireEvent.click(screen.getByRole('option', { name: 'Behringer · Ch 1' }));
    expect(mutate.mock.calls[0]![0]).toEqual({ deskId: 'd1', room: 'Main Hall', action: 'patch', source: 'dev:0' });
    fireEvent.click(screen.getByRole('button', { name: /^Stop/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Click again to stop/ }));
    expect(mutate.mock.calls[1]![0]).toEqual({ deskId: 'd1', room: 'Tamarind A', action: 'stop', source: undefined });
  });
});
