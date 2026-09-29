'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { categoryLabel, EDITION_CATEGORIES, type EditionCategory } from '@/lib/events/events';
import { uploadFile } from '@/lib/uploads';

/** One tile on the app's My Events screen (`GET /catalog` categories). */
export type Category = { slug: EditionCategory; label: string; imageUrl: string | null; sortOrder: number };

/** Artwork types the API signs tile uploads for. */
export const TILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const MAX_TILE_BYTES = 5 * 1024 * 1024;

export function tileProblem(file: { type: string; size: number }): string | null {
  if (!(TILE_TYPES as readonly string[]).includes(file.type)) return 'Use a JPG, PNG, WebP or HEIC image.';
  if (file.size > MAX_TILE_BYTES) return 'Use an image under 5 MB.';
  return null;
}

const KEY = ['admin', 'catalog', 'categories'] as const;
const DEMO_LABELS: Partial<Record<EditionCategory, string>> = { training: 'Classes & Training', community: 'Community Events' };
const demoCategories: Category[] = EDITION_CATEGORIES.map((slug, sortOrder) => ({ slug, label: DEMO_LABELS[slug] ?? categoryLabel(slug), imageUrl: null, sortOrder }));

/** The category tiles, in the app's order. */
export function useCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }) => {
      const list = DEMO_MODE ? demoCategories.map((c) => ({ ...c })) : (await api.get<{ categories: Category[] }>('/catalog', undefined, signal)).categories;
      return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
    },
  });
}

export type CategoryPatch = { slug: EditionCategory; label?: string; sortOrder?: number; image?: File | null };

/** Saves tiles: a new picture is uploaded first; `image: null` clears it (the app then shows an event's cover). */
export function useUpdateCategories(onProgress?: (fraction: number | null) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patches: CategoryPatch[]) => {
      for (const { slug, label, sortOrder, image } of patches) {
        let imageKey: string | null | undefined;
        if (image) {
          onProgress?.(0);
          try {
            imageKey = await uploadFile(image, { presignPath: `/catalog/categories/${slug}/image-upload`, contentType: image.type }, (f) => onProgress?.(f));
          } finally {
            onProgress?.(null);
          }
        } else if (image === null) imageKey = null;
        const body = { ...(label !== undefined ? { label } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}), ...(imageKey !== undefined ? { imageKey } : {}) };
        if (DEMO_MODE) {
          const row = demoCategories.find((c) => c.slug === slug);
          if (row) Object.assign(row, { label: body.label ?? row.label, sortOrder: body.sortOrder ?? row.sortOrder, imageUrl: image ? URL.createObjectURL(image) : image === null ? null : row.imageUrl });
          continue;
        }
        await api.patch(`/catalog/categories/${slug}`, body);
      }
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: KEY }),
  });
}
