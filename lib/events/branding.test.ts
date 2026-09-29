import { describe, expect, it } from 'vitest';

import { contrast, imageProblem, normaliseColor, paleWarning, PIC_NAVY, textOn } from '@/lib/events/branding';

describe('event branding', () => {
  it('accepts JPG, PNG and WebP within the size limit', () => {
    expect(imageProblem({ type: 'image/png', size: 500_000 }, 'logo')).toBeNull();
    expect(imageProblem({ type: 'image/jpeg', size: 9 * 1024 * 1024 }, 'cover')).toBeNull();
    expect(imageProblem({ type: 'image/svg+xml', size: 10 }, 'logo')).toMatch(/JPG, PNG or WebP/);
    expect(imageProblem({ type: 'image/png', size: 3 * 1024 * 1024 }, 'logo')).toMatch(/under 2 MB/);
  });

  it('reads colours however they are typed', () => {
    expect(normaliseColor('#0F6B3A')).toBe('#0f6b3a');
    expect(normaliseColor(' 0f6b3a ')).toBe('#0f6b3a');
    expect(normaliseColor('#fff')).toBeNull();
    expect(normaliseColor('green')).toBeNull();
  });

  it('writes white on dark buttons and near-black on light ones', () => {
    expect(textOn(PIC_NAVY)).toBe('#ffffff');
    expect(textOn('#fdc802')).toBe('#111111');
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('warns when a colour would barely show on white', () => {
    expect(paleWarning(PIC_NAVY)).toBeNull();
    expect(paleWarning('#fdc802')).toMatch(/pale/);
  });
});
