import { describe, expect, it } from 'vitest';

import { aspectWarning, clamp01, DEFAULT_NAME, layoutFraction, looksLikeCode, lowResolution, normaliseCode, type TextPlacement } from '@/lib/certificates/certificates';

describe('certificate codes', () => {
  it('normalises what people type or paste', () => {
    expect(normaliseCode(' gs26-k7m2p-x4qrt ')).toBe('GS26-K7M2P-X4QRT');
    expect(normaliseCode('GS26 – K7M2P – X4QRT')).toBe('GS26-K7M2P-X4QRT');
  });

  it('only sends plausible codes', () => {
    expect(looksLikeCode('GS26-K7M2P-X4QRT')).toBe(true);
    expect(looksLikeCode('ABC')).toBe(false);
    expect(looksLikeCode('GS26/K7M2P')).toBe(false);
  });
});

describe('certificate design', () => {
  const measure = (text: string, _p: TextPlacement, size: number) => text.length * size * 0.5;
  const A4 = Math.SQRT2;

  it('lays text out as the API does: centred on its point, long names shrunk to fit', () => {
    const short = layoutFraction(DEFAULT_NAME, A4, 'Ada Eze', measure);
    expect(short.left + short.width / 2).toBeCloseTo(0.5);
    expect(short.width).toBeCloseTo(0.7);
    expect(short.fontSize).toBeCloseTo(0.065);
    const long = layoutFraction(DEFAULT_NAME, A4, 'Adaeze Chiamaka Nwachukwu-Okonkwo-Abubakar-Bello', measure);
    expect(long.fontSize).toBeLessThan(0.065);
  });

  it('anchors right-aligned text at its right edge', () => {
    const box = layoutFraction({ ...DEFAULT_NAME, align: 'right', x: 0.9 }, A4, 'x', measure);
    expect(box.left + box.width).toBeCloseTo(0.9);
  });

  it('warns about artwork that is not A4-shaped or too small', () => {
    expect(aspectWarning(3508, 2480)).toBeNull();
    expect(aspectWarning(1920, 1080)).toContain('stretched');
    expect(lowResolution(1200, 848)).toBe(true);
    expect(lowResolution(3508, 2480)).toBe(false);
    expect(clamp01(1.4)).toBe(1);
  });
});
