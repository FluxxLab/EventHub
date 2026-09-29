'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { PhotoType, Speaker, toSpeakerBody } from '@/lib/speakers/speakers';

const LIST = ['admin', 'speakers'] as const;
const REVEAL = ['admin', 'speakers', 'reveal'] as const;

const DEMO_SPEAKERS: Speaker[] = [
  { id: 's1', name: 'Amina Yusuf', role: 'Director', organisation: 'Policy Innovation Centre', avatarUrl: null },
  { id: 's2', name: 'Tunde Bakare', role: 'CTO', organisation: 'Paystack', avatarUrl: null },
  { id: 's3', name: 'Grace Obi', role: 'Researcher', organisation: 'NBS', avatarUrl: null },
  { id: 's4', name: 'Kwame Mensah', role: 'Economist', organisation: 'AfDB', avatarUrl: null },
  { id: 's5', name: 'Sarah Kimani', role: null, organisation: 'UN Women', avatarUrl: null },
];
let demoRevealed = false;

/** Every speaker, sorted by name. Speakers are shared across editions (organisers always see them all). */
export function useSpeakers() {
  return useQuery({
    queryKey: LIST,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO_SPEAKERS) : api.get<Speaker[]>('/speakers', undefined, signal)),
  });
}

/** Whether delegates can see the line-up yet. */
export function useSpeakerReveal() {
  return useQuery({
    queryKey: REVEAL,
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve({ revealed: demoRevealed }) : api.get<{ revealed: boolean }>('/speakers/reveal', undefined, signal),
  });
}

/** Reveals or hides the line-up for every delegate at once (open apps update live). */
export function useSetSpeakerReveal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (revealed: boolean) =>
      DEMO_MODE ? Promise.resolve({ revealed: (demoRevealed = revealed) }) : api.post<{ revealed: boolean }>('/speakers/reveal', { revealed }),
    onSuccess: (result) => client.setQueryData(REVEAL, result),
  });
}

/**
 * Uploads a speaker photo and returns its public URL. The API signs an S3 upload; the file then
 * goes straight to S3, which is the one request that deliberately bypasses the API client (it
 * must not carry our bearer token to a third-party host).
 */
export async function uploadSpeakerPhoto(file: File): Promise<string> {
  if (DEMO_MODE) return URL.createObjectURL(file);
  const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string }>('/speakers/avatar-upload', {
    contentType: file.type as PhotoType,
  });
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!response.ok) throw new ApiError(response.status, 'The photo could not be uploaded. Try again, or add the speaker without one.');
  return publicUrl;
}

/** Adds a speaker (uploading the photo first when there is one) and puts them in the list. */
export function useCreateSpeaker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, photo }: { body: Omit<ReturnType<typeof toSpeakerBody>, 'avatarUrl'>; photo: File | null }) => {
      const avatarUrl = photo ? await uploadSpeakerPhoto(photo) : undefined;
      const full = { ...body, ...(avatarUrl ? { avatarUrl } : {}) };
      return DEMO_MODE
        ? ({ id: `demo-${Date.now()}`, role: null, organisation: null, avatarUrl: null, ...full } as Speaker)
        : api.post<Speaker>('/speakers', full);
    },
    onSuccess: (created) => {
      client.setQueryData<Speaker[]>(LIST, (was) => [...(was ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: LIST });
    },
  });
}

/**
 * Saves a speaker's details, uploading a new photo first when one was picked. `removePhoto`
 * clears it. Role and organisation are always sent, so emptying them clears them.
 */
export function useUpdateSpeaker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ speaker, body, photo, removePhoto }: { speaker: Speaker; body: Omit<ReturnType<typeof toSpeakerBody>, 'avatarUrl'>; photo: File | null; removePhoto: boolean }) => {
      const avatarUrl = photo ? await uploadSpeakerPhoto(photo) : removePhoto ? '' : undefined;
      const patch = { name: body.name, role: body.role ?? '', organisation: body.organisation ?? '', ...(avatarUrl !== undefined ? { avatarUrl } : {}) };
      if (DEMO_MODE) return { ...speaker, name: patch.name, role: patch.role || null, organisation: patch.organisation || null, ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}) };
      return api.patch<Speaker>(`/speakers/${speaker.id}`, patch);
    },
    onSuccess: (saved) => {
      client.setQueryData<Speaker[]>(LIST, (was) => was?.map((s) => (s.id === saved.id ? saved : s)));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: LIST });
      // the programme shows speakers' names and photos too
      void client.invalidateQueries({ queryKey: ['admin', 'sessions'] });
    },
  });
}

/** Deletes a speaker. The API refuses, naming the sessions, while they are on any. */
export function useDeleteSpeaker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => (DEMO_MODE ? Promise.resolve() : api.delete<void>(`/speakers/${id}`)),
    onSuccess: (_void, id) => {
      client.setQueryData<Speaker[]>(LIST, (was) => was?.filter((s) => s.id !== id));
      if (!DEMO_MODE) void client.invalidateQueries({ queryKey: LIST });
    },
  });
}
