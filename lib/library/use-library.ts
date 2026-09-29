'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { LibraryItem, LibraryKind } from '@/lib/library/library';
import { uploadFile } from '@/lib/uploads';

const key = (editionId: string) => ['admin', 'library', editionId] as const;

let demoItems: LibraryItem[] = [
  { id: 'demo-l1', title: 'Gender budgeting toolkit', description: 'A step-by-step guide for ministries and state assemblies.', kind: 'document', url: '#', isFile: true, topic: 'Toolkits', sizeLabel: '2.4 MB', sortOrder: 0, isPublished: true, updatedAt: new Date().toISOString() },
  { id: 'demo-l2', title: 'Why gender data matters (explainer)', description: null, kind: 'video', url: 'https://www.youtube.com/watch?v=example', isFile: false, topic: 'Gender data', sizeLabel: null, sortOrder: 1, isPublished: true, updatedAt: new Date().toISOString() },
  { id: 'demo-l3', title: 'UN Women: Progress of the World’s Women', description: 'The flagship report.', kind: 'link', url: 'https://www.unwomen.org/en/digital-library', isFile: false, topic: 'Gender data', sizeLabel: null, sortOrder: 2, isPublished: false, updatedAt: new Date().toISOString() },
];

export type LibraryDraft = { title: string; description: string | null; kind: LibraryKind; url: string; topic: string | null; sizeLabel: string | null; isPublished: boolean };

export function useLibrary(editionId: string) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: ({ signal }): Promise<LibraryItem[]> => (DEMO_MODE ? Promise.resolve(demoItems) : api.get<LibraryItem[]>(`/editions/${editionId}/library/manage`, undefined, signal)),
  });
}

/** Sends a file to storage for the library; the returned key is what the resource stores. */
export function uploadResource(editionId: string, file: File, contentType: string, onProgress: (f: number) => void) {
  return uploadFile(file, { presignPath: `/editions/${editionId}/library/upload-url`, contentType, sized: true }, onProgress);
}

export function useLibraryActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: key(editionId) });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: Partial<LibraryDraft> }): Promise<LibraryItem> => {
      if (DEMO_MODE) {
        const now = new Date().toISOString();
        if (id) demoItems = demoItems.map((i) => (i.id === id ? { ...i, ...draft, isFile: draft.url ? !/^https:/.test(draft.url) : i.isFile, updatedAt: now } : i));
        else {
          const d = draft as LibraryDraft;
          demoItems = [...demoItems, { id: `demo-l${Date.now()}`, title: d.title, kind: d.kind, url: d.url, description: d.description ?? null, topic: d.topic ?? null, sizeLabel: d.sizeLabel ?? null, isPublished: d.isPublished ?? true, isFile: !/^https:/.test(d.url ?? ''), sortOrder: demoItems.length, updatedAt: now }];
        }
        return (id ? demoItems.find((i) => i.id === id) : demoItems.at(-1))!;
      }
      return id ? api.patch<LibraryItem>(`/library/items/${id}`, draft) : api.post<LibraryItem>(`/editions/${editionId}/library`, draft);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) demoItems = demoItems.filter((i) => i.id !== id);
      else await api.delete(`/library/items/${id}`);
    },
    onSuccess: refresh,
  });

  /** Swaps two neighbours' places. */
  const move = useMutation({
    mutationFn: async ({ a, b }: { a: LibraryItem; b: LibraryItem }) => {
      if (DEMO_MODE) {
        demoItems = demoItems.map((i) => (i.id === a.id ? { ...i, sortOrder: b.sortOrder } : i.id === b.id ? { ...i, sortOrder: a.sortOrder } : i));
        return;
      }
      await api.patch(`/library/items/${a.id}`, { sortOrder: b.sortOrder });
      await api.patch(`/library/items/${b.id}`, { sortOrder: a.sortOrder });
    },
    onSuccess: refresh,
  });

  return { save, remove, move };
}
