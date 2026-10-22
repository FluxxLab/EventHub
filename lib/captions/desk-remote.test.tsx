import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (p: unknown) => void>();
const socket = {
  emit: vi.fn(),
  on: vi.fn((name: string, fn: (p: unknown) => void) => handlers.set(name, fn)),
  off: vi.fn(),
};
vi.mock('@/lib/api/realtime', () => ({ useRealtimeSocket: () => socket }));

import { useDeskReporting } from '@/lib/captions/desk-remote';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a desk run from another computer', () => {
  it('reports its channels and rooms once its inputs are open, and carries out requests', () => {
    const onCommand = vi.fn();
    const { rerender } = renderHook((p: { connected: boolean }) =>
      useDeskReporting({
        connected: p.connected,
        name: 'Behringer · ab12',
        channels: [{ value: 'dev:0', label: 'Behringer · Ch 1' }],
        rooms: ['Main Hall'],
        sourceOf: () => null,
        states: {},
        onCommand,
      }),
      { initialProps: { connected: false } },
    );
    expect(socket.emit).not.toHaveBeenCalled();
    rerender({ connected: true });
    const [event, report] = socket.emit.mock.calls[0] as [string, { connected: boolean; rooms: { room: string; source: null }[] }];
    expect(event).toBe('desk:state');
    expect(report.connected).toBe(true);
    expect(report.rooms).toEqual([{ room: 'Main Hall', source: null, status: null, message: null }]);
    act(() => handlers.get('desk:command')!({ id: '1', action: 'start', room: 'Main Hall', by: 'u1' }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ action: 'start', room: 'Main Hall' }));
  });
});
