import { describe, expect, it } from 'vitest';

import { isStaleBuild } from '@/lib/stale-build';

describe('a stale build', () => {
  it('is recognised from the browsers’ missing-chunk errors', () => {
    expect(isStaleBuild(new Error('Failed to load chunk /_next/static/chunks/2enmy0t1d0xgk.js from module 50363'))).toBe(true);
    expect(isStaleBuild(Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isStaleBuild(new TypeError('Failed to fetch dynamically imported module: https://x/_next/a.js'))).toBe(true);
    expect(isStaleBuild(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('is not confused with other failures', () => {
    expect(isStaleBuild(new Error('The brief could not be written.'))).toBe(false);
    expect(isStaleBuild(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleBuild(undefined)).toBe(false);
  });
});
