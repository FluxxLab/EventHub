// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { contentTypeOf, shiftText, startInstant, ytDlpCommand } from '@/lib/captions/recaption';

describe('re-caption from YouTube', () => {
  it('knows the audio by its extension', () => {
    expect(contentTypeOf({ name: 'Build 2026 Day 1.m4a', type: '' })).toBe('audio/mp4');
    expect(contentTypeOf({ name: 'day.mp3', type: 'audio/mpeg' })).toBe('audio/mpeg');
    expect(contentTypeOf({ name: 'notes.pdf', type: 'application/pdf' })).toBeNull();
  });

  it('reads when the stream started: the printed number, or a date and time', () => {
    expect(startInstant('1792572432', 'utc')).toBe(new Date(1792572432 * 1000).toISOString());
    expect(startInstant('2026-10-21 08:47:12', 'utc')).toBe('2026-10-21T08:47:12.000Z');
    expect(startInstant('2026-10-21 09:47', 'abuja')).toBe('2026-10-21T08:47:00.000Z');
    expect(startInstant('yesterday', 'utc')).toBeNull();
  });

  it('builds the laptop command around the link', () => {
    expect(ytDlpCommand('https://youtu.be/abc')).toContain('"https://youtu.be/abc"');
    expect(ytDlpCommand('')).toContain('PASTE-YOUTUBE-LINK');
  });
});

describe('start-time correction text', () => {
  it('reads hours and minutes, and says nothing under a minute', () => {
    expect(shiftText(6 * 3_600_000 + 29 * 60_000)).toBe('6 h 29 min later');
    expect(shiftText(-45 * 60_000)).toBe('45 min earlier');
    expect(shiftText(2 * 3_600_000)).toBe('2 h later');
    expect(shiftText(30_000)).toBeNull();
    expect(shiftText(null)).toBeNull();
  });
});
