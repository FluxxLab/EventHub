import { z } from 'zod';

import type { Session, Speaker } from '@/lib/programme/programme';

export type { Speaker };

/** Photo types the API will sign an upload for (its AVATAR_CONTENT_TYPES). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
/** A console-side cap so a camera original does not stall the upload; 5 MB is plenty for a portrait. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Why a chosen photo cannot be used, or null when it can. */
export function photoProblem(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Use a JPG, PNG, WebP or HEIC photo.';
  if (file.size > MAX_PHOTO_BYTES) return 'Use a photo under 5 MB.';
  return null;
}

export const createSpeakerSchema = z.object({
  name: z.string().trim().min(1, 'Enter the speaker’s name.').max(255, 'Keep the name under 255 characters.'),
  role: z.string().trim().max(255, 'Keep the role under 255 characters.'),
  organisation: z.string().trim().max(255, 'Keep the organisation under 255 characters.'),
});
export type CreateSpeakerForm = z.input<typeof createSpeakerSchema>;

/** The `POST /speakers` body: blanks left out, since the API only accepts fields it knows. */
export function toSpeakerBody(form: z.output<typeof createSpeakerSchema>, avatarUrl: string | null) {
  return {
    name: form.name,
    ...(form.role ? { role: form.role } : {}),
    ...(form.organisation ? { organisation: form.organisation } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

/** "Director, PIC" / "Director" / "PIC" / "". */
export const affiliation = (s: Pick<Speaker, 'role' | 'organisation'>) => [s.role, s.organisation].filter(Boolean).join(', ');

/** Each speaker's sessions in one edition's programme, by speaker id. */
export function sessionsBySpeaker(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) for (const sp of session.speakers) map.set(sp.id, [...(map.get(sp.id) ?? []), session]);
  return map;
}

/** Speakers whose name, role or organisation contains the query, ignoring case. */
export function searchSpeakers(speakers: Speaker[], query: string): Speaker[] {
  const q = query.trim().toLowerCase();
  if (!q) return speakers;
  return speakers.filter((s) => [s.name, s.role, s.organisation].some((v) => v?.toLowerCase().includes(q)));
}
