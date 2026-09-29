import { z } from 'zod';

import type { Edition } from '@/lib/events/events';

/**
 * `GET /editions/:id/rooms`: described rooms plus rooms the programme names, busiest first.
 * `id` is null for a room only the programme names (nobody has described it yet).
 */
export type Room = { id: string | null; name: string; floor: string | null; notes: string | null; sessionCount: number };

/* ------------------------------------------------------------------ venue */

export type Pin = { lat: number; lng: number };

/**
 * One "lat, lng" string, as Google Maps copies it ("9.0579, 7.4951"; a space or semicolon also
 * works). Blank is no pin; anything else that is not two in-range numbers is invalid.
 */
export function parsePin(text: string): Pin | null | 'invalid' {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) return 'invalid';
  const [lat, lng] = parts.map(Number) as [number, number];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'invalid';
  return { lat, lng };
}

export const formatPin = (pin: Pin) => `${pin.lat}, ${pin.lng}`;

export const venueSchema = z.object({
  venue: z.string().trim().max(255, 'Keep the venue under 255 characters.'),
  address: z.string().trim().max(255, 'Keep the address under 255 characters.'),
  city: z.string().trim().max(100, 'Keep the city under 100 characters.'),
  pin: z
    .string()
    .trim()
    .refine((v) => parsePin(v) !== 'invalid', 'Paste the two numbers Google Maps gives you, like 9.0579, 7.4951.'),
});
export type VenueForm = z.input<typeof venueSchema>;

/** The edition's venue as form values. */
export const venueFormOf = (edition: Edition): VenueForm => ({
  venue: edition.venue ?? '',
  address: edition.address ?? '',
  city: edition.city ?? '',
  pin: edition.latitude == null || edition.longitude == null ? '' : formatPin({ lat: edition.latitude, lng: edition.longitude }),
});

/**
 * Only what changed, as the `PATCH /editions/:id` body. Blank text clears a field (the API
 * treats empty as "unset"); a cleared pin sends nulls.
 */
export function venuePatch(before: VenueForm, after: z.output<typeof venueSchema>) {
  const patch: Record<string, string | number | null> = {};
  for (const key of ['venue', 'address', 'city'] as const) if (after[key] !== before[key].trim()) patch[key] = after[key];
  const was = parsePin(before.pin);
  const now = parsePin(after.pin);
  const same = was === now || (typeof was === 'object' && typeof now === 'object' && was?.lat === now?.lat && was?.lng === now?.lng);
  if (!same && now !== 'invalid') {
    patch.latitude = now ? now.lat : null;
    patch.longitude = now ? now.lng : null;
  }
  return patch;
}

/** An OpenStreetMap embed centred on the pin, for the preview (no API key needed). */
export function mapEmbedUrl(pin: Pin): string {
  const d = 0.004; // about 400 m either side: the venue and its streets
  const bbox = [pin.lng - d, pin.lat - d, pin.lng + d, pin.lat + d].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${pin.lat},${pin.lng}`;
}

/* ------------------------------------------------------------------- rooms */

export const roomSchema = z.object({
  name: z.string().trim().min(1, 'Enter the room’s name.').max(120, 'Keep the name under 120 characters.'),
  floor: z.string().trim().max(60, 'Keep the floor under 60 characters.'),
  notes: z.string().trim().max(500, 'Keep the notes under 500 characters.'),
});
export type RoomForm = z.input<typeof roomSchema>;

export const roomFormOf = (room: Room | null): RoomForm => ({ name: room?.name ?? '', floor: room?.floor ?? '', notes: room?.notes ?? '' });

/** The room body: blank floor and notes sent as null so an edit can clear them. */
export const toRoomBody = (form: z.output<typeof roomSchema>) => ({
  name: form.name.replace(/\s+/g, ' '),
  floor: form.floor || null,
  notes: form.notes || null,
});
