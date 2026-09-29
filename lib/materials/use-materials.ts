'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { Material, MaterialKind } from '@/lib/materials/materials';
import { uploadPdf } from '@/lib/uploads';

const key = (sessionId: string | undefined) => ['admin', 'materials', sessionId ?? 'none'] as const;

const demo: Record<string, Material[]> = {
  d1: [
    { id: 'm1', sessionId: 'd1', title: 'Opening plenary slides', url: 'https://bucket.s3.amazonaws.com/documents/1?X-Amz-Signature=demo', kind: 'slides', sizeLabel: '4.2 MB', sortOrder: 0 },
    { id: 'm2', sessionId: 'd1', title: 'Summit communiqué', url: 'https://bucket.s3.amazonaws.com/documents/2?X-Amz-Signature=demo', kind: 'communique', sizeLabel: '310 KB', sortOrder: 1 },
    { id: 'm3', sessionId: 'd1', title: 'Full recording', url: 'https://www.youtube.com/watch?v=demo', kind: 'recording', sizeLabel: null, sortOrder: 2 },
  ],
  d2: [{ id: 'm4', sessionId: 'd2', title: 'Digital ID inclusion study', url: 'https://policycentre.org/research/digital-id', kind: 'paper', sizeLabel: null, sortOrder: 0 }],
};

/** A session's materials in display order (uploads come back with a fresh signed URL). */
export function useMaterials(sessionId: string | undefined) {
  return useQuery({
    queryKey: key(sessionId),
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve([...(demo[sessionId!] ?? [])]) : api.get<Material[]>(`/sessions/${sessionId}/materials`, undefined, signal),
    enabled: !!sessionId,
    select: (list) => [...list].sort((a, b) => a.sortOrder - b.sortOrder),
  });
}

export type MaterialSave = {
  id?: string;
  title: string;
  kind: MaterialKind;
  sizeLabel: string;
  /** A new link, or a file to upload; neither when editing an uploaded material's details. */
  link?: string;
  file?: File;
  sortOrder?: number;
};

/** Add, edit, remove and reorder a session's materials. Each refreshes the list. */
export function useMaterialActions(sessionId: string | undefined, onProgress: (fraction: number | null) => void = () => undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: key(sessionId) });
  const demoList = () => (demo[sessionId!] ??= []);

  const save = useMutation({
    mutationFn: async ({ id, title, kind, sizeLabel, link, file, sortOrder }: MaterialSave) => {
      let url = link;
      if (file) {
        onProgress(0);
        try {
          url = await uploadPdf(file, onProgress);
        } finally {
          onProgress(null);
        }
      }
      // Never send a signed URL back: only a new link or a new upload's key replaces the stored one.
      const body = { title, kind, sizeLabel: sizeLabel || undefined, ...(url ? { url } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}) };
      if (!DEMO_MODE) return id ? api.patch<Material>(`/materials/${id}`, body) : api.post<Material>(`/sessions/${sessionId}/materials`, body);
      const list = demoList();
      if (id) {
        const i = list.findIndex((m) => m.id === id);
        list[i] = { ...list[i]!, title, kind, sizeLabel: sizeLabel || null, ...(url ? { url: file ? `https://bucket.s3.amazonaws.com/${url}?X-Amz-Signature=demo` : url } : {}) };
        return list[i]!;
      }
      const created: Material = {
        id: `m-${Date.now()}`,
        sessionId: sessionId!,
        title,
        kind,
        sizeLabel: sizeLabel || null,
        url: file ? `https://bucket.s3.amazonaws.com/${url}?X-Amz-Signature=demo` : url!,
        sortOrder: sortOrder ?? list.length,
      };
      list.push(created);
      return created;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!DEMO_MODE) return api.delete(`/materials/${id}`);
      demo[sessionId!] = demoList().filter((m) => m.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: async (changes: { id: string; sortOrder: number }[]) => {
      if (DEMO_MODE) {
        for (const c of changes) {
          const m = demoList().find((x) => x.id === c.id);
          if (m) m.sortOrder = c.sortOrder;
        }
        return;
      }
      for (const c of changes) await api.patch(`/materials/${c.id}`, { sortOrder: c.sortOrder });
    },
    onSuccess: refresh,
  });

  return { save, remove, reorder };
}
