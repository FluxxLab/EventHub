import { describe, expect, it } from 'vitest';

import { photoCount, photoProblem, thumbSize } from '@/lib/gallery/gallery';

describe('gallery', () => {
  it('takes JPEG, PNG and WebP up to 15 MB', () => {
    expect(photoProblem({ name: 'a.jpg', type: 'image/jpeg', size: 8_000_000 })).toBeNull();
    expect(photoProblem({ name: 'a.heic', type: 'image/heic', size: 2_000_000 })).toContain('export HEIC photos as JPEG');
    expect(photoProblem({ name: 'big.jpg', type: 'image/jpeg', size: 20 * 1024 * 1024 })).toBe('big.jpg is 20 MB; the limit is 15 MB. Export it smaller.');
  });

  it('makes the small copy 480 px on its longest side, never larger than the photo', () => {
    expect(thumbSize(6000, 4000)).toEqual({ width: 480, height: 320 });
    expect(thumbSize(3000, 4000)).toEqual({ width: 360, height: 480 });
    expect(thumbSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('counts photos in words', () => {
    expect(photoCount(0)).toBe('No photos yet');
    expect(photoCount(1)).toBe('1 photo');
    expect(photoCount(1240)).toBe('1,240 photos');
  });
});
