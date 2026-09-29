import { describe, expect, it } from 'vitest';

import { emptyMaterial, fileProblem, formatBytes, materialSchema, moveMaterial, sourceLabel, type Material } from '@/lib/materials/materials';

describe('materialSchema', () => {
  it('needs a file to upload, or a full https link', () => {
    const upload = { ...emptyMaterial(true), title: 'Slides' };
    const noFile = materialSchema.safeParse(upload);
    expect(noFile.success || noFile.error.issues[0]!.path).toEqual(['hasFile']);
    expect(materialSchema.safeParse({ ...upload, hasFile: true }).success).toBe(true);

    const link = { ...emptyMaterial(false), title: 'Recording' };
    expect(materialSchema.safeParse({ ...link, url: 'youtube.com/watch' }).success).toBe(false);
    expect(materialSchema.safeParse({ ...link, url: 'http://example.org/a' }).success).toBe(false);
    expect(materialSchema.safeParse({ ...link, url: 'https://youtube.com/watch?v=1' }).success).toBe(true);
  });

  it('starts on a link when the person cannot upload', () => {
    expect(emptyMaterial(false).source).toBe('link');
  });
});

describe('files', () => {
  it('formats sizes as people read them', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(20_480)).toBe('20 KB');
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(formatBytes(24 * 1024 * 1024)).toBe('24 MB');
  });

  it('accepts PDFs under the limit only', () => {
    expect(fileProblem({ type: 'application/pdf', size: 1000, name: 'deck.pdf' })).toBeNull();
    expect(fileProblem({ type: '', size: 1000, name: 'Deck.PDF' })).toBeNull();
    expect(fileProblem({ type: 'application/vnd.ms-powerpoint', size: 1000, name: 'deck.pptx' })).toContain('Only PDFs');
    expect(fileProblem({ type: 'application/pdf', size: 60 * 1024 * 1024, name: 'big.pdf' })).toContain('limit');
  });

  it('names where a material lives', () => {
    expect(sourceLabel('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(sourceLabel('https://bucket.s3.amazonaws.com/documents/x?X-Amz-Signature=abc')).toBe('Uploaded PDF');
    expect(sourceLabel('documents/abc')).toBe('Uploaded file');
  });
});

describe('moveMaterial', () => {
  const m = (id: string, sortOrder: number): Material => ({ id, sessionId: 's', title: id, url: 'https://x.org', kind: 'other', sizeLabel: null, sortOrder });
  it('swaps with the neighbour and renumbers, returning only changes', () => {
    // c already sits at 1 once swapped ahead of b, so only b moves
    expect(moveMaterial([m('a', 0), m('b', 1), m('c', 1)], 'c', -1)).toEqual([{ id: 'b', sortOrder: 2 }]);
    expect(moveMaterial([m('a', 0), m('b', 1), m('c', 2)], 'a', 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    expect(moveMaterial([m('a', 0)], 'a', -1)).toEqual([]);
  });
});
