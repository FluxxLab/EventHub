import { describe, expect, it } from 'vitest';

import { byTopic, fileProblem, linkProblem, sizeLabel, topicsOf, uploadType, type LibraryItem } from '@/lib/library/library';

const item = (id: string, topic: string | null, sortOrder: number): LibraryItem => ({ id, title: id, description: null, kind: 'document', url: null, isFile: true, topic, sizeLabel: null, sortOrder, isPublished: true, updatedAt: '' });

describe('learning library', () => {
  it('groups resources by topic in their order, with the rest last', () => {
    const groups = byTopic([item('c', null, 2), item('a', 'Toolkits', 1), item('b', 'Budgets', 0), item('d', 'Toolkits', 3)]);
    expect(groups.map((g) => [g.topic, g.items.map((i) => i.id)])).toEqual([
      ['Budgets', ['b']],
      ['Toolkits', ['a', 'd']],
      ['More', ['c']],
    ]);
    expect(byTopic([item('x', null, 0)])[0]!.topic).toBe('Resources');
    expect(topicsOf([item('a', ' Toolkits ', 0), item('b', 'Toolkits', 1), item('c', null, 2)])).toEqual(['Toolkits']);
  });

  it('takes documents and audio of the right kinds and size', () => {
    expect(fileProblem('document', { name: 'r.pdf', type: 'application/pdf', size: 3_000_000 })).toBeNull();
    expect(fileProblem('document', { name: 'r.doc', type: 'application/msword', size: 3_000 })).toContain('Save older formats');
    expect(fileProblem('audio', { name: 'a.m4a', type: 'audio/x-m4a', size: 30_000_000 })).toBeNull();
    expect(fileProblem('audio', { name: 'a.wav', type: 'audio/wav', size: 3_000 })).toBe('Use an MP3 or M4A file.');
    expect(fileProblem('document', { name: 'big.pdf', type: 'application/pdf', size: 200 * 1024 * 1024 })).toContain('limit is 100 MB');
    expect(uploadType({ type: 'audio/x-m4a' })).toBe('audio/mp4');
  });

  it('wants full https links', () => {
    expect(linkProblem('https://youtu.be/abc')).toBeNull();
    expect(linkProblem('youtu.be/abc')).toBe('Use a full https:// address.');
    expect(linkProblem('http://example.org')).toBe('Use a full https:// address.');
    expect(linkProblem(' ')).toBe('Give the address.');
    expect(sizeLabel(2_500_000)).toBe('2.4 MB');
    expect(sizeLabel(640 * 1024)).toBe('640 KB');
  });
});
