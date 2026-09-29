'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { PHOTO_BATCH, photoProblem, prepare, type Album, type Photo } from '@/lib/gallery/gallery';
import { uploadFile } from '@/lib/uploads';

const albumsKey = (editionId: string) => ['admin', 'gallery', editionId] as const;
const photosKey = (albumId: string) => ['admin', 'gallery-album', albumId] as const;

/* Demo: albums and photos held in memory, pictures kept as local links. */
let demoAlbums: Album[] = [];
const demoPhotos = new Map<string, Photo[]>();
const now = () => new Date().toISOString();
const demoAlbumView = (a: Album): Album => {
  const list = demoPhotos.get(a.id) ?? [];
  const cover = list.find((p) => p.id === a.coverPhotoId) ?? list[0];
  return { ...a, photos: list.length, coverUrl: cover?.thumbUrl ?? null };
};

export function useAlbums(editionId: string) {
  return useQuery({
    queryKey: albumsKey(editionId),
    queryFn: ({ signal }): Promise<Album[]> => (DEMO_MODE ? Promise.resolve(demoAlbums.filter((a) => a.editionId === editionId).map(demoAlbumView)) : api.get<Album[]>(`/editions/${editionId}/gallery/manage`, undefined, signal)),
  });
}

export function useAlbumPhotos(albumId: string | null) {
  return useQuery({
    queryKey: photosKey(albumId ?? 'none'),
    queryFn: async ({ signal }): Promise<Photo[]> => (DEMO_MODE ? (demoPhotos.get(albumId!) ?? []) : (await api.get<{ photos: Photo[] }>(`/gallery/albums/${albumId}`, undefined, signal)).photos),
    enabled: !!albumId,
    // photo links are signed for 45 minutes
    refetchInterval: 30 * 60_000,
  });
}

export function useAlbumActions(editionId: string) {
  const client = useQueryClient();
  const refresh = (albumId?: string) => {
    void client.invalidateQueries({ queryKey: albumsKey(editionId) });
    if (albumId) void client.invalidateQueries({ queryKey: photosKey(albumId) });
  };

  const save = useMutation({
    mutationFn: async ({ id, ...body }: { id?: string; title?: string; description?: string | null; isPublished?: boolean; coverPhotoId?: string | null }) => {
      if (DEMO_MODE) {
        if (id) demoAlbums = demoAlbums.map((a) => (a.id === id ? { ...a, ...body } : a));
        else demoAlbums = [...demoAlbums, { id: `demo-album-${Date.now()}`, editionId, title: body.title ?? 'Album', description: body.description ?? null, isPublished: body.isPublished ?? true, sortOrder: demoAlbums.length, photos: 0, coverPhotoId: null, coverUrl: null, createdAt: now() }];
        return (id ? demoAlbums.find((a) => a.id === id) : demoAlbums.at(-1))!;
      }
      return id ? api.patch<Album>(`/gallery/albums/${id}`, body) : api.post<Album>(`/editions/${editionId}/gallery/albums`, body);
    },
    onSuccess: (a) => refresh(a.id),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) {
        demoAlbums = demoAlbums.filter((a) => a.id !== id);
        demoPhotos.delete(id);
      } else await api.delete(`/gallery/albums/${id}`);
    },
    onSuccess: () => refresh(),
  });

  const updatePhoto = useMutation({
    mutationFn: async ({ photo, caption }: { photo: Photo; caption: string | null }): Promise<Photo> => {
      if (DEMO_MODE) {
        const next = { ...photo, caption };
        demoPhotos.set(photo.albumId, (demoPhotos.get(photo.albumId) ?? []).map((p) => (p.id === photo.id ? next : p)));
        return next;
      }
      return api.patch<Photo>(`/gallery/photos/${photo.id}`, { caption });
    },
    onSuccess: (p) => refresh(p.albumId),
  });

  const removePhoto = useMutation({
    mutationFn: async (photo: Photo) => {
      if (DEMO_MODE) demoPhotos.set(photo.albumId, (demoPhotos.get(photo.albumId) ?? []).filter((p) => p.id !== photo.id));
      else await api.delete(`/gallery/photos/${photo.id}`);
      return photo;
    },
    onSuccess: (p) => refresh(p.albumId),
  });

  return { save, remove, updatePhoto, removePhoto };
}

export type UploadItem = { name: string; state: 'waiting' | 'uploading' | 'done' | 'failed'; progress: number; error?: string };

/**
 * Uploads photos into an album, three at a time: each original and its small copy go to storage,
 * then the album gets them in batches. A photo that fails is marked and the rest carry on.
 */
export function usePhotoUpload(editionId: string, albumId: string) {
  const client = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (files: File[]) => {
      const list = files.map((f) => ({ file: f, problem: photoProblem(f) }));
      setItems(list.map(({ file, problem }) => ({ name: file.name, state: problem ? 'failed' : 'waiting', progress: 0, error: problem ?? undefined })));
      setRunning(true);
      const set = (i: number, patch: Partial<UploadItem>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it)));
      const ready: { key: string; thumbKey: string; width: number; height: number; sizeBytes: number; demoUrl?: string; demoThumb?: string }[] = [];
      const queue = list.map((x, i) => ({ ...x, i })).filter((x) => !x.problem);

      const one = async ({ file, i }: { file: File; i: number }) => {
        set(i, { state: 'uploading', progress: 0.02 });
        try {
          const { width, height, thumb } = await prepare(file);
          const key = await uploadFile(file, { presignPath: `/editions/${editionId}/gallery/upload-url`, contentType: file.type, sized: true }, (p) => set(i, { progress: 0.05 + p * 0.85 }));
          const thumbKey = await uploadFile(thumb, { presignPath: `/editions/${editionId}/gallery/upload-url`, contentType: 'image/jpeg', sized: true }, (p) => set(i, { progress: 0.9 + p * 0.1 }));
          ready.push({ key, thumbKey, width, height, sizeBytes: file.size, ...(DEMO_MODE ? { demoUrl: URL.createObjectURL(file), demoThumb: URL.createObjectURL(thumb) } : {}) });
          set(i, { state: 'done', progress: 1 });
        } catch (e) {
          set(i, { state: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
        }
      };
      // three at a time: quick, without choking the venue's upload
      const workers = Array.from({ length: 3 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await one(next);
      });
      await Promise.all(workers);

      for (let i = 0; i < ready.length; i += PHOTO_BATCH) {
        const batch = ready.slice(i, i + PHOTO_BATCH);
        if (DEMO_MODE) {
          const had = demoPhotos.get(albumId) ?? [];
          demoPhotos.set(albumId, [
            ...had,
            ...batch.map((b, j) => ({ id: `demo-photo-${Date.now()}-${i + j}`, albumId, url: b.demoUrl!, thumbUrl: b.demoThumb!, width: b.width, height: b.height, sizeBytes: b.sizeBytes, caption: null, sortOrder: had.length + j })),
          ]);
        } else {
          await api.post(`/gallery/albums/${albumId}/photos`, { photos: batch.map(({ key, thumbKey, width, height, sizeBytes }) => ({ key, thumbKey, width, height, sizeBytes })) });
        }
      }
      setRunning(false);
      void client.invalidateQueries({ queryKey: albumsKey(editionId) });
      void client.invalidateQueries({ queryKey: photosKey(albumId) });
    },
    [albumId, client, editionId],
  );

  return { items, running, run, clear: () => setItems([]) };
}
