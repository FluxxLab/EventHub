import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isTabSource, tabInputId, useSoundDesk } from '@/lib/captions/use-captions';

const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), channelCount: 2, channelCountMode: 'max', fftSize: 0, getByteTimeDomainData: vi.fn() });
class FakeAudioContext {
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  createMediaStreamSource = vi.fn(node);
  createGain = vi.fn(node);
  createChannelSplitter = vi.fn(node);
  createAnalyser = vi.fn(node);
}

function track(kind: 'audio' | 'video') {
  const listeners: Record<string, () => void> = {};
  return {
    kind,
    label: kind === 'audio' ? 'YouTube' : '',
    stop: vi.fn(),
    getSettings: () => ({ channelCount: 2 }),
    addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
    end: () => listeners.ended?.(),
  };
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaStream', class {
    constructor(public tracks: unknown[]) {}
  });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function share(tracks: ReturnType<typeof track>[]) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn(() =>
        Promise.resolve({ getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), getTracks: () => tracks }),
      ),
    },
  });
}

describe('captioning from a browser tab', () => {
  it('adds the tab as one input, and drops it when the sharing stops', async () => {
    const audio = track('audio');
    share([audio, track('video')]);
    const { result } = renderHook(() => useSoundDesk());
    await act(() => result.current.shareTab());
    expect(result.current.inputs).toEqual([expect.objectContaining({ label: 'Browser tab · YouTube', channels: 1 })]);
    act(() => audio.end());
    expect(result.current.inputs).toBeNull();
  });

  it('explains when the tab was shared without its sound', async () => {
    share([track('video')]);
    const { result } = renderHook(() => useSoundDesk());
    await act(() => result.current.shareTab());
    expect(result.current.inputs).toBeNull();
    expect(result.current.error).toMatch(/Also share tab audio/);
  });

  it('knows the same tab again after a reload, so its rooms stay patched', () => {
    expect(tabInputId('Build 2026 Main Hall - YouTube')).toBe(tabInputId('Build 2026 Main Hall - YouTube'));
    expect(tabInputId('Build 2026 Main Hall - YouTube')).not.toBe(tabInputId('Build 2026 Tamarind A - YouTube'));
    expect(isTabSource(`${tabInputId('x')}#0`)).toBe(true);
    expect(isTabSource('abc123#0')).toBe(false);
  });
});
